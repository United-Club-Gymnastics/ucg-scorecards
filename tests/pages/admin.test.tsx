import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { choose, optionLabels } from '../helpers/select';

// Invented data only.
const firebase = vi.hoisted(() => ({
  isDomainAdmin: (email: string | null | undefined, verified: boolean) => verified && !!email && email.endsWith('@unitedclubgymnastics.org'),
  signInAdmin: vi.fn(),
  signOutAdmin: vi.fn(),
}));
vi.mock('../../src/lib/firebase', () => firebase);
const auth = vi.hoisted(() => ({ user: null as null | { email: string; emailVerified: boolean; isAnonymous: boolean } }));
vi.mock('../../src/pages/use-auth', () => ({ useUser: () => auth.user }));
const store = vi.hoisted(() => ({
  isListedAdmin: vi.fn(), loadMeetSettings: vi.fn(), loadMeets: vi.fn(), loadSheetLists: vi.fn(), sheetsWithPhotos: vi.fn(),
  listPhotos: vi.fn(), photoUrl: vi.fn(), deletePhoto: vi.fn(), getPhoto: vi.fn(),
}));
vi.mock('../../src/lib/store', () => store);

import AdminPage from '../../src/pages/AdminPage';

const sheets = (rows: [string, string, number, number][]) => rows.map(([event, squad, page, pages]) => ({ event, squad, page, pages }));
const LISTS = [
  { sessionId: 's1-orange', name: 'Session 1', location: 'Orange', discipline: 'MAG', sheets: sheets([['FX', 'A', 1, 1], ['FX', 'B', 1, 1], ['PH', 'A', 1, 1]]) },
  { sessionId: 's1-green', name: 'Session 1', location: 'Green', discipline: 'MAG', sheets: sheets([['FX', 'A', 1, 1]]) },
  { sessionId: 's2-purple', name: 'Session 2', location: 'Purple', discipline: 'TNT', sheets: sheets([['TR', 'A', 1, 2], ['TR', 'A', 2, 2], ['SY', 'Flight 1', 1, 1]]) },
];
const v = (name: string) => ({ path: `scorecards/x/${name}`, name, at: new Date(Date.UTC(2026, 9, 24, 15, 30)) });

function open() {
  render(<MemoryRouter><AdminPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* jsdom */ }
  auth.user = { email: 'host@unitedclubgymnastics.org', emailVerified: true, isAnonymous: false };
  store.loadMeets.mockResolvedValue([{ id: 'testmeet-ab12', name: 'Test Nationals', createdAt: 2 }, { id: 'old-cd34', name: 'Old Meet', createdAt: 1 }]);
  store.loadSheetLists.mockResolvedValue(LISTS);
  store.loadMeetSettings.mockResolvedValue({ meetName: 'Test Nationals', gymOrder: ['Green', 'Orange'] });
  store.sheetsWithPhotos.mockResolvedValue(new Set(['FX/A/1']));
  store.listPhotos.mockResolvedValue([v('20261024T153000Z-bbbbbb.jpg'), v('20261024T152000Z-aaaaaa.jpg')]);
  store.photoUrl.mockImplementation(async (p: string) => `https://storage.example/${p}`);
  store.deletePhoto.mockResolvedValue(undefined);
  store.getPhoto.mockImplementation(async (p: string) => new Blob([p]));
});

describe('admin view', () => {
  it('asks to sign in when signed out or on the anonymous uploader account', async () => {
    auth.user = null;
    open();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(store.loadMeets).not.toHaveBeenCalled();
  });

  it('turns away an account that is not an admin', async () => {
    auth.user = { email: 'someone@example.com', emailVerified: true, isAnonymous: false };
    store.isListedAdmin.mockResolvedValue(false);
    open();
    expect(await screen.findByText(/can’t view scorecard photos/)).toBeInTheDocument();
  });

  it('lets in an account listed in admins/', async () => {
    auth.user = { email: 'helper@example.com', emailVerified: true, isAnonymous: false };
    store.isListedAdmin.mockResolvedValue(true);
    open();
    expect(await screen.findByRole('heading', { name: 'Scorecard photos' })).toBeInTheDocument();
    expect(store.isListedAdmin).toHaveBeenCalledWith('helper@example.com');
  });

  it('picks Session, then Gym (meet order), Apparatus and Squad, and shows the newest photo with zoom and download', async () => {
    const user = userEvent.setup();
    open();
    expect(await screen.findByRole('heading', { name: 'Session 1 – Green · Floor · Squad A' })).toBeInTheDocument();
    expect(await optionLabels(user, screen.getByLabelText('Gym'))).toEqual(['Green', 'Orange']);
    await choose(user, screen.getByLabelText('Gym'), 'Orange');
    await choose(user, screen.getByLabelText('Squad'), 'Squad B');
    expect(await screen.findByRole('heading', { name: 'Session 1 – Orange · Floor · Squad B' })).toBeInTheDocument();
    const img = await screen.findByRole('img', { name: /Scorecard photo/ });
    expect(img).toHaveAttribute('src', 'https://storage.example/scorecards/x/20261024T153000Z-bbbbbb.jpg');
    expect(store.listPhotos).toHaveBeenLastCalledWith({ meetId: 'testmeet-ab12', sessionId: 's1-orange', event: 'FX', squad: 'B', page: 1 });
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'Session 1 - Orange - Floor - Squad B.jpg');
    await user.click(screen.getByRole('button', { name: '2×' }));
    expect(img.style.width).toBe('200%');
    expect(screen.getByRole('heading', { name: 'All versions (2)' })).toBeInTheDocument();
  });

  it('shows Page only when a squad\'s list runs to more than one page, and names synchro flights', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('heading', { name: 'Session 1 – Green · Floor · Squad A' });
    await choose(user, screen.getByLabelText('Session'), 'Session 2');
    expect(await screen.findByLabelText('Page')).toBeInTheDocument();
    expect(await optionLabels(user, screen.getByLabelText('Apparatus'))).toEqual(['Trampoline', 'Synchro Trampoline']);
    await choose(user, screen.getByLabelText('Apparatus'), 'Synchro Trampoline');
    expect(screen.queryByLabelText('Page')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Session 2 – Purple · Synchro Trampoline · Flight 1' })).toBeInTheDocument();
  });

  it('lists the sheets with no photo yet; choosing one opens it', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('heading', { name: 'Session 1 – Green · Floor · Squad A' });
    await choose(user, screen.getByLabelText('Gym'), 'Orange');
    const section = (await screen.findByRole('heading', { name: 'Photos for Session 1 – Orange' })).closest('section')!;
    expect(await within(section).findByText('1 of 3')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Pommel Horse · Squad A' }));
    expect(await screen.findByRole('heading', { name: 'Session 1 – Orange · Pommel Horse · Squad A' })).toBeInTheDocument();
  });

  it('deletes a version only after confirming', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('img', { name: /Scorecard photo/ });
    await user.click(screen.getByRole('button', { name: 'Delete this photo…' }));
    expect(store.deletePhoto).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(store.deletePhoto).toHaveBeenCalledWith('scorecards/x/20261024T153000Z-bbbbbb.jpg');
  });

  it('says when a meet has no sheet lists yet', async () => {
    store.loadSheetLists.mockResolvedValue([]);
    open();
    expect(await screen.findByText(/no sheet lists yet/)).toBeInTheDocument();
  });

  it('downloads every photo of the meet as one zip', async () => {
    const user = userEvent.setup();
    const made: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => { made.push(b); return 'blob:zip'; }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    open();
    await user.click(await screen.findByRole('button', { name: 'Download all photos for this meet (.zip)' }));
    // 7 sheets in the meet, every one listed with the same 2 versions.
    expect(await screen.findByText(/Saved 14 photos: 7 of 7 sheets have a photo\./)).toBeInTheDocument();
    expect(store.getPhoto).toHaveBeenCalledTimes(14);
    expect(click).toHaveBeenCalledTimes(1);
    expect(made.at(-1)?.type).toBe('application/zip');
    click.mockRestore();
  });
});
