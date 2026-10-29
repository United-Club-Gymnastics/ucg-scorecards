import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Invented data only.
vi.mock('../../src/lib/firebase', () => ({ ensureUploader: vi.fn(async () => undefined) }));
const store = vi.hoisted(() => ({ loadSheetList: vi.fn(), loadMeetSettings: vi.fn(), startUpload: vi.fn() }));
vi.mock('../../src/lib/store', () => store);
const capture = vi.hoisted(() => ({
  shotFromFile: vi.fn(),
  shotFromVideo: vi.fn(),
  PortraitPhotoError: class PortraitPhotoError extends Error { constructor() { super('That photo is upright. Turn your phone sideways and take it again.'); } },
}));
vi.mock('../../src/lib/capture', () => capture);

import CapturePage from '../../src/pages/CapturePage';

const LIST = {
  sessionId: 's1-green', name: 'Session 1', location: 'Green', discipline: 'MAG',
  sheets: [{ event: 'FX', squad: 'A', page: 1, pages: 1 }, { event: 'FX', squad: 'B', page: 1, pages: 1 }],
};
const PATH = '/s/testmeet-ab12/s1-green/FX/A/1';
const LINK = (squad = 'A') => `https://scorecards.unitedclubgymnastics.org/#/s/testmeet-ab12/s1-green/FX/${squad}/1`;
const shot = (qrText: string | null) => ({ blob: new Blob(['x'], { type: 'image/jpeg' }), url: 'blob:photo', width: 2400, height: 1855, qrText });

/** An upload task like Firebase's: `on` reports progress, awaiting it resolves or rejects. */
function task(result: 'ok' | { code: string }) {
  const p = result === 'ok' ? Promise.resolve({}) : Promise.reject(Object.assign(new Error('x'), result));
  p.catch(() => undefined);
  return Object.assign(p, {
    on: (_: string, next: (s: { bytesTransferred: number; totalBytes: number }) => void) => next({ bytesTransferred: 5, totalBytes: 10 }),
    cancel: vi.fn(),
  });
}

function open(path = PATH) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/s/*" element={<CapturePage />} /></Routes>
    </MemoryRouter>,
  );
}

async function takeFromFile() {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  await act(async () => { fireEvent.change(input, { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } }); });
}

let landscape = true;
function stubScreen() {
  window.matchMedia = ((q: string) => ({ matches: q.includes('landscape') ? landscape : !landscape, media: q, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  // A camera that is still opening (jsdom has none).
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => new Promise(() => undefined) } });
}

beforeEach(() => {
  vi.clearAllMocks();
  landscape = true;
  stubScreen();
  store.loadSheetList.mockResolvedValue(LIST);
  store.loadMeetSettings.mockResolvedValue({ meetName: 'Test Nationals', gymOrder: [] });
  URL.revokeObjectURL = vi.fn();
});

describe('capture page', () => {
  it('says which sheet the QR named', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Session 1 – Green' })).toBeInTheDocument();
    expect(screen.getByText('Floor · Squad A')).toBeInTheDocument();
    expect(screen.getByText('Test Nationals')).toBeInTheDocument();
    expect(store.loadSheetList).toHaveBeenCalledWith('testmeet-ab12', 's1-green');
  });

  it('refuses a link that is not a sheet, or a sheet not in the list', async () => {
    open('/s/nonsense');
    expect(await screen.findByText('We can’t find this scorecard')).toBeInTheDocument();
    expect(store.loadSheetList).not.toHaveBeenCalled();
  });

  it('refuses a sheet the session does not print', async () => {
    open('/s/testmeet-ab12/s1-green/FX/Z/1');
    expect(await screen.findByText('We can’t find this scorecard')).toBeInTheDocument();
  });

  it('reviews the photo, confirms the QR matches, uploads it and says so', async () => {
    capture.shotFromFile.mockResolvedValue(shot(LINK()));
    store.startUpload.mockReturnValue(task('ok'));
    const user = userEvent.setup();
    open();
    await screen.findByText('Floor · Squad A');
    await takeFromFile();
    expect(screen.getByText(/The code on the card matches/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use photo' }));
    expect(await screen.findByText('Photo uploaded')).toBeInTheDocument();
    const [path, , meta] = store.startUpload.mock.calls[0];
    expect(path).toMatch(/^scorecards\/testmeet-ab12\/s1-green\/FX\/A\/1\/\d{8}T\d{6}Z-[a-z0-9]{6}\.jpg$/);
    expect(meta).toEqual({ fileName: 'Session 1 - Green - Floor - Squad A.jpg', qr: 'match' });
  });

  it('warns when the photo shows a different sheet, and the person can retake', async () => {
    capture.shotFromFile.mockResolvedValue(shot(LINK('B')));
    open();
    await screen.findByText('Floor · Squad A');
    await takeFromFile();
    expect(screen.getByRole('alert')).toHaveTextContent('This looks like a different scorecard (Floor · Squad B)');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retake' }));
    expect(screen.getByRole('dialog', { name: 'Camera' })).toBeInTheDocument();
  });

  it('the camera refuses an upright phone with a "turn your phone" prompt, and opens held sideways', async () => {
    landscape = false;
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Take photo' }));
    const cam = screen.getByRole('dialog', { name: 'Camera' });
    expect(within(cam).getByRole('alert')).toHaveTextContent('Turn your phone sideways');
    expect(within(cam).queryByRole('button', { name: 'Take photo' })).toBeNull();
    await user.click(within(cam).getByRole('button', { name: 'Cancel' }));
    landscape = true;
    await user.click(screen.getByRole('button', { name: 'Take photo' }));
    expect(within(screen.getByRole('dialog', { name: 'Camera' })).getByRole('button', { name: 'Take photo' })).toBeDisabled();
    expect(screen.getByText('Opening the camera…')).toBeInTheDocument();
  });

  it('refuses an upright photo with a clear message', async () => {
    capture.shotFromFile.mockRejectedValue(new capture.PortraitPhotoError());
    open();
    await screen.findByText('Floor · Squad A');
    await takeFromFile();
    expect(screen.getByRole('alert')).toHaveTextContent('Turn your phone sideways');
    expect(screen.queryByRole('button', { name: 'Use photo' })).toBeNull();
  });

  it('on a dropped signal it keeps the photo, says it will retry, and sends it when back online', async () => {
    capture.shotFromFile.mockResolvedValue(shot(null));
    store.startUpload.mockReturnValueOnce(task({ code: 'storage/retry-limit-exceeded' })).mockReturnValueOnce(task('ok'));
    const user = userEvent.setup();
    open();
    await screen.findByText('Floor · Squad A');
    await takeFromFile();
    expect(screen.getByText(/couldn’t read the code/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use photo' }));
    expect(await screen.findByText(/Weak signal — trying again/)).toBeInTheDocument();
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(await screen.findByText('Photo uploaded')).toBeInTheDocument();
    expect(store.startUpload).toHaveBeenCalledTimes(2);
    // Each try gets its own name, so a try that did land is never overwritten.
    expect(store.startUpload.mock.calls[0][0]).not.toBe(store.startUpload.mock.calls[1][0]);
  });

  it('a refused upload says why and does not retry', async () => {
    capture.shotFromFile.mockResolvedValue(shot(LINK()));
    store.startUpload.mockReturnValue(task({ code: 'storage/unauthorized' }));
    const user = userEvent.setup();
    open();
    await screen.findByText('Floor · Squad A');
    await takeFromFile();
    await user.click(screen.getByRole('button', { name: 'Use photo' }));
    expect(await screen.findByText('Not uploaded')).toBeInTheDocument();
    expect(screen.getByText(/not open for photos/)).toBeInTheDocument();
    expect(store.startUpload).toHaveBeenCalledTimes(1);
  });
});
