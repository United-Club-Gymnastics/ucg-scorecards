// Admins (same rule as Lineups: a verified @unitedclubgymnastics.org account, or one listed in admins/{email}) pick
// Session → Gym → Apparatus → Squad → Page and see that scorecard's photo: full size, zoom, download, earlier versions, and
// which of the session's sheets have no photo yet.
import { useEffect, useMemo, useState } from 'react';
import Select from '../components/Select';
import { isDomainAdmin, signInAdmin, signOutAdmin } from '../lib/firebase';
import { coverage, eventsOf, gymsFor, pagesOf, sessionNames, squadsOf } from '../lib/pick';
import { eventName, sheetKeyOf, sheetLabel, squadLabel, type SheetEntry, type SheetList } from '../lib/sheet';
import { isListedAdmin, loadMeetSettings, loadMeets, loadSheetLists, sheetsWithPhotos, type MeetRow } from '../lib/store';
import PhotoViewer from './PhotoViewer';
import { useUser } from './use-auth';
import './admin.css';

const MEET_KEY = 'ucg-scorecards:meet';
const remembered = () => { try { return localStorage.getItem(MEET_KEY) ?? ''; } catch { return ''; } };
const remember = (id: string) => { try { localStorage.setItem(MEET_KEY, id); } catch { /* private window */ } };

export default function AdminPage() {
  const user = useUser();
  // A domain account is an admin at once; any other account is looked up in admins/{email} (the rules decide either way).
  const [listed, setListed] = useState<{ email: string; ok: boolean } | null>(null);
  const signedIn = user && !user.isAnonymous ? user : null;
  const domain = !!signedIn && isDomainAdmin(signedIn.email, signedIn.emailVerified);
  const email = signedIn?.email ?? '';
  const allowed = !signedIn ? undefined : domain ? true : listed?.email === email ? listed.ok : undefined;
  const [signInError, setSignInError] = useState('');

  useEffect(() => {
    if (!signedIn || domain) return;
    let live = true;
    isListedAdmin(email).then((ok) => live && setListed({ email, ok }));
    return () => { live = false; };
  }, [signedIn, domain, email]);

  async function signIn() {
    setSignInError('');
    try { await signInAdmin(); } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') setSignInError('Sign-in did not work. Try again.');
    }
  }

  if (user === undefined) return <main className="adm"><p role="status">Loading…</p></main>;
  if (!user || user.isAnonymous) {
    return (
      <main className="adm">
        <section className="adm-card adm-gate">
          <h1 className="display adm-title">Scorecard photos</h1>
          <p><b>Taking a photo?</b> Scan the code printed on the scorecard with your phone’s camera.</p>
          <p>Admins sign in to view the photos.</p>
          <button type="button" className="btn primary" onClick={() => void signIn()}>Sign in with Google</button>
          {signInError && <p className="adm-banner err" role="alert">{signInError}</p>}
        </section>
      </main>
    );
  }
  if (allowed === undefined) return <main className="adm"><p role="status">Checking access…</p></main>;
  if (!allowed) {
    return (
      <main className="adm">
        <section className="adm-card adm-gate" role="alert">
          <h1 className="display adm-title">No access</h1>
          <p>{user.email} can’t view scorecard photos. Sign in with your @unitedclubgymnastics.org account, or ask Julia to add you.</p>
          <button type="button" className="btn ghost" onClick={() => void signOutAdmin()}>Sign out</button>
        </section>
      </main>
    );
  }
  return <Admin email={user.email ?? ''} />;
}

/** A load tied to what it was for: while `for` differs from the current choice, it is still loading. */
type Result<T> = { for: string; ok: true; value: T } | { for: string; ok: false };

function Admin({ email }: { email: string }) {
  const [meets, setMeets] = useState<Result<MeetRow[]> | null>(null);
  const [meetPick, setMeetPick] = useState('');
  const [data, setData] = useState<Result<{ lists: SheetList[]; gymOrder: string[] }> | null>(null);
  const [namePick, setName] = useState('');
  const [sessionPick, setSessionId] = useState('');
  const [eventPick, setEvent] = useState('');
  const [squadPick, setSquad] = useState('');
  const [page, setPage] = useState(1);
  const [photos, setPhotos] = useState<Result<Set<string>> | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    loadMeets().then((rows) => setMeets({ for: '', ok: true, value: rows }), () => setMeets({ for: '', ok: false }));
  }, []);
  const meetRows = meets?.ok ? meets.value : [];
  // Each choice falls back to the first option when it is not (or no longer) one, so there is always a sheet to show.
  const pickOr = (v: string, options: string[]) => (options.includes(v) ? v : options[0] ?? '');
  const meetId = pickOr(meetPick || remembered(), meetRows.map((m) => m.id));

  useEffect(() => {
    if (!meetId) return;
    let live = true;
    Promise.all([loadSheetLists(meetId), loadMeetSettings(meetId).catch(() => ({ gymOrder: [] as string[] }))])
      .then(([lists, s]) => live && setData({ for: meetId, ok: true, value: { lists, gymOrder: s.gymOrder } }))
      .catch(() => live && setData({ for: meetId, ok: false }));
    return () => { live = false; };
  }, [meetId]);

  const ready = data?.for === meetId && data.ok ? data.value : null;
  const lists = useMemo(() => ready?.lists ?? [], [ready]);
  const names = useMemo(() => sessionNames(lists), [lists]);
  const name = pickOr(namePick, names);
  const gyms = useMemo(() => gymsFor(lists, name, ready?.gymOrder ?? []), [lists, name, ready]);
  const sessionId = pickOr(sessionPick, gyms.map((g) => g.sessionId));
  const list = gyms.find((l) => l.sessionId === sessionId);
  const events = list ? eventsOf(list) : [];
  const event = pickOr(eventPick, events);
  const squads = list && event ? squadsOf(list, event) : [];
  const squad = pickOr(squadPick, squads);
  const pages = list && event && squad ? pagesOf(list, event, squad) : [];
  const entry: SheetEntry | undefined = pages.find((p) => p.page === page) ?? pages[0];

  const photosFor = list ? `${meetId}/${list.sessionId}#${reload}` : '';
  useEffect(() => {
    if (!list) return;
    let live = true;
    sheetsWithPhotos(meetId, list.sessionId, list.sheets.map(sheetKeyOf))
      .then((s) => live && setPhotos({ for: photosFor, ok: true, value: s }))
      .catch(() => live && setPhotos({ for: photosFor, ok: false }));
    return () => { live = false; };
  }, [meetId, list, photosFor]);

  const photoSet = photos?.for === photosFor ? photos : null;
  const cover = list && photoSet?.ok ? coverage(list, photoSet.value) : null;
  const choose = (e: SheetEntry) => { setEvent(e.event); setSquad(e.squad); setPage(e.page); };

  return (
    <main className="adm">
      <header className="adm-head">
        <h1 className="display adm-title">Scorecard photos</h1>
        <div className="adm-user"><span>{email}</span><button type="button" className="btn ghost small" onClick={() => void signOutAdmin()}>Sign out</button></div>
      </header>

      <section className="adm-card">
        {meets && !meets.ok && <p className="adm-banner err" role="alert">Could not load the meets. Reload the page to try again.</p>}
        <div className="adm-picks">
          <label className="adm-field adm-meet">
            <span>Meet</span>
            <Select aria-label="Meet" value={meetId} disabled={meetRows.length === 0} placeholder={meets ? '—' : 'Loading…'}
              onChange={(v) => { setMeetPick(v); remember(v); }}
              options={meetRows.map((m) => ({ value: m.id, label: m.name }))} />
          </label>
          <label className="adm-field">
            <span>Session</span>
            <Select aria-label="Session" value={name} onChange={setName} disabled={names.length === 0} placeholder="—" options={names.map((n) => ({ value: n, label: n }))} />
          </label>
          <label className="adm-field">
            <span>Gym</span>
            <Select aria-label="Gym" value={sessionId} onChange={setSessionId} disabled={gyms.length === 0} placeholder="—" options={gyms.map((g) => ({ value: g.sessionId, label: g.location || '(no gym)' }))} />
          </label>
          <label className="adm-field">
            <span>Apparatus</span>
            <Select aria-label="Apparatus" value={event} onChange={(v) => { setEvent(v); setPage(1); }} disabled={!list} placeholder="—" options={list ? events.map((e) => ({ value: e, label: eventName(list.discipline, e) })) : []} />
          </label>
          <label className="adm-field">
            <span>{event === 'SY' ? 'Flight' : 'Squad'}</span>
            <Select aria-label="Squad" value={squad} onChange={(v) => { setSquad(v); setPage(1); }} disabled={squads.length === 0} placeholder="—" options={squads.map((s) => ({ value: s, label: squadLabel(event, s) }))} />
          </label>
          {pages.length > 1 && (
            <label className="adm-field">
              <span>Page</span>
              <Select aria-label="Page" value={String(entry?.page ?? 1)} onChange={(v) => setPage(Number(v))} options={pages.map((p) => ({ value: String(p.page), label: `Page ${p.page} of ${p.pages}` }))} />
            </label>
          )}
        </div>
        {data?.for === meetId && !data.ok && <p className="adm-banner err" role="alert">Could not load this meet’s sessions. Reload the page to try again.</p>}
        {meetId && data?.for !== meetId && <p role="status">Loading sessions…</p>}
        {ready && lists.length === 0 && (
          <p className="adm-banner warn" role="status">This meet has no sheet lists yet. Open Exports in UCG Lineups once: it saves the list of scorecards each session prints.</p>
        )}
      </section>

      {list && entry && (
        <PhotoViewer
          key={`${meetId}/${list.sessionId}/${sheetKeyOf(entry)}`}
          sheetKey={{ meetId, sessionId: list.sessionId, event: entry.event, squad: entry.squad, page: entry.page }}
          list={list}
          entry={entry}
          onChanged={() => setReload((n) => n + 1)}
        />
      )}

      {list && (
        <section className="adm-card" aria-labelledby="adm-missing">
          <h2 id="adm-missing" className="display">Photos for {list.name}{list.location ? ` – ${list.location}` : ''}</h2>
          {!photoSet && <p role="status">Checking which sheets have photos…</p>}
          {photoSet && !photoSet.ok && <p className="adm-banner err" role="alert">Could not check which sheets have photos.</p>}
          {cover && (
            <>
              <p><b>{cover.done} of {cover.total}</b> sheets have a photo.{cover.missing.length === 0 && cover.total > 0 && ' Every sheet is in.'}</p>
              {cover.missing.length > 0 && (
                <>
                  <h3>No photo yet</h3>
                  <ul className="adm-missing">
                    {cover.missing.map((e) => (
                      <li key={sheetKeyOf(e)}>
                        <button type="button" className="adm-chip" onClick={() => choose(e)}>{sheetLabel(list.discipline, e)}</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
