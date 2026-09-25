import { useEffect, useRef, useState } from 'react';
import type { Order, MenuItem, OrderEvent } from '../../../../src/types';
import type { DemoSession } from '../../../../src/demo/session';

type State = Awaited<ReturnType<DemoSession['snapshot']>>;
type View = 'orders' | 'menu' | 'history' | 'about';
const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const statusLabel: Record<string, string> = {
  NEW: 'New order',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'Preparing',
  READY: 'Ready for pickup',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELED: 'Canceled'
};
const nextStatus: Record<string, { status: string; label: string }> = {
  NEW: { status: 'ACCEPTED', label: 'Accept order' },
  ACCEPTED: { status: 'IN_PROGRESS', label: 'Start preparing' },
  IN_PROGRESS: { status: 'READY', label: 'Mark ready' },
  READY: { status: 'COMPLETED', label: 'Complete order' }
};
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    phone:
      'M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L9 11a16 16 0 0 0 4 4l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z',
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    menu: 'M4 5h16 M4 12h16 M4 19h16',
    clock: 'M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    layers: 'm12 3 10 5-10 5L2 8l10-5 M2 12l10 5 10-5 M2 16l10 5 10-5',
    arrow: 'M5 12h14 m-5-5 5 5-5 5',
    check: 'm5 12 4 4L19 6',
    reset: 'M3 10a9 9 0 1 1 2 9 M3 3v7h7',
    close: 'm6 6 12 12 M6 18 18 6',
    code: 'm8 7-5 5 5 5 m8-10 5 5-5 5 m-3-14-2 18',
    play: 'm8 5 11 7-11 7V5',
    pause: 'M8 5v14 M16 5v14',
    book: 'M12 5c-4-3-8-1-10 0v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-3-10 0Zm0 0v15'
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.grid} />
    </svg>
  );
}
export function DemoApp() {
  const [state, setState] = useState<State | null>(null);
  const [token, setToken] = useState('');
  const [view, setView] = useState<View>('orders');
  const [scenario, setScenario] = useState('pickup');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [connected, setConnected] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const initial = useRef<Promise<{ token: string; state: State }> | null>(null);
  const transcript = useRef<HTMLDivElement>(null);

  async function begin() {
    const response = await fetch('/api/demo/sessions', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Unable to start the demo.');
    sessionStorage.setItem('restaurant-demo-session', data.token);
    return data as { token: string; state: State };
  }
  useEffect(() => {
    let alive = true;
    if (!initial.current)
      initial.current = (async () => {
        const saved = sessionStorage.getItem('restaurant-demo-session');
        if (saved) {
          const response = await fetch('/api/demo/state', { headers: { 'x-demo-session': saved } });
          if (response.ok) return { token: saved, state: (await response.json()) as State };
          if (response.status !== 401) throw new Error('The demo is unavailable. Please try again.');
        }
        return begin();
      })();
    initial.current
      .then((data) => {
        if (alive) {
          setToken(data.token);
          setState(data.state);
        }
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!token || expired) return;
    let alive = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/demo/state', { headers: { 'x-demo-session': token } });
        if (!alive) return;
        if (response.status === 401) {
          setExpired(true);
          setPlaying(false);
          return;
        }
        if (response.ok) setState(await response.json());
      } catch {
        if (alive) setConnected(false);
      }
    };
    const events = new EventSource('/api/demo/events?session=' + encodeURIComponent(token));
    events.onopen = () => {
      if (alive) setConnected(true);
    };
    events.onerror = () => {
      if (alive) setConnected(false);
    };
    events.addEventListener('update', () => {
      void refresh();
    });
    const poll = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      alive = false;
      events.close();
      window.clearInterval(poll);
    };
  }, [token, expired]);

  async function act(path: string, body: object = {}, method = 'POST') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/demo/' + path, {
        method,
        headers: { 'content-type': 'application/json', 'x-demo-session': token },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (response.status === 401) setExpired(true);
      if (!response.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.');
      setState(data);
    } catch (err) {
      setPlaying(false);
      setError(err instanceof Error ? err.message : 'Unable to connect.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!playing || busy || state?.call?.phase !== 'talking') return;
    const timer = window.setTimeout(() => {
      void act('next', { step: state.call!.cursor });
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [playing, busy, state?.call?.cursor, state?.call?.phase]);
  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'smooth' });
  }, [state?.call?.cursor, state?.call?.phase]);
  useEffect(() => {
    if (!detailId) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailId(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [detailId]);

  const orders = state?.orders ?? [];
  const active = orders.filter((order) => nextStatus[order.status]);
  const completed = orders.filter((order) => !nextStatus[order.status]);
  const selected = orders.find((order) => order.id === detailId);
  const call = state?.call;
  const nav: Array<[View, string, string]> = [
    ['orders', 'Orders', 'grid'],
    ['menu', 'Menu & availability', 'menu'],
    ['history', 'Call history', 'clock'],
    ['about', 'How it works', 'layers']
  ];

  return (
    <div className="demo-app">
      <aside className="demo-sidebar">
        <a className="demo-brand" href="/" aria-label="Restaurant Call Agent home">
          <span className="brand-icon">
            <Icon name="phone" size={21} />
          </span>
          <span>
            Call Agent<span className="brand-caption">RESTAURANT OPERATIONS</span>
          </span>
        </a>
        <div className="restaurant-switch">
          <span className="restaurant-avatar">GW</span>
          <div>
            <strong>Golden Wok</strong>
            <small>Sample restaurant</small>
          </div>
          <span className="switch-dots">⌄</span>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Workspace">
          {nav.map(([id, label, icon]) => (
            <button
              key={id}
              className={view === id ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(id)}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {id === 'orders' && <span className="nav-count">{active.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-indicator">
            <span className="status-dot" />
            Interactive demo
          </div>
          <p>
            Your own sample workspace.
            <br />
            Explore freely. Reset anytime.
          </p>
          <a href="https://github.com/ichen27/restaurant-call-agent" target="_blank" rel="noreferrer">
            <Icon name="code" size={17} />
            View source <span>↗</span>
          </a>
          <div className="builder-credit">
            Built by{' '}
            <a href="https://github.com/ichen27" target="_blank" rel="noreferrer">
              Ivan Chen
            </a>
          </div>
        </div>
      </aside>
      <div className="demo-workspace">
        <div className="demo-banner">
          <span>
            <span className="demo-tag">DEMO</span> Synthetic calls. Real order workflow.
          </span>
          <button onClick={() => setView('about')}>
            Explore the architecture <span>↗</span>
          </button>
        </div>
        <header className="workspace-topbar">
          <div className="breadcrumb">
            Golden Wok <span>/</span> <strong>{nav.find(([id]) => id === view)?.[1]}</strong>
          </div>
          <div className="topbar-actions">
            <span className={'connection ' + (connected ? 'online' : '')}>
              <span className="status-dot" />
              {connected ? 'Connected' : 'Reconnecting'}
            </span>
            <button
              className="reset-button"
              disabled={busy || !state}
              onClick={() => {
                setPlaying(false);
                setDetailId(null);
                void act('reset');
              }}
            >
              <Icon name="reset" size={15} />
              Reset demo
            </button>
            <span className="user-avatar">IC</span>
          </div>
        </header>
        {error && (
          <div className="demo-alert" role="alert">
            {error}
            {!state && <button onClick={() => location.reload()}>Try again</button>}
          </div>
        )}
        {expired && (
          <div className="demo-alert" role="alert">
            Your sample workspace has expired.
            <button
              onClick={() => {
                sessionStorage.removeItem('restaurant-demo-session');
                location.reload();
              }}
            >
              Start a fresh demo
            </button>
          </div>
        )}
        {!state ? (
          <main className="loading-state">
            <span className="loading-ring" />
            <h1>Opening your workspace</h1>
            <p>Setting the table with a few sample orders.</p>
          </main>
        ) : (
          <main className="demo-main">
            <div className="page-heading">
              <div>
                <div className="eyebrow">THE FRONT COUNTER, REIMAGINED</div>
                <h1>
                  {view === 'orders'
                    ? 'Orders'
                    : view === 'menu'
                      ? 'Menu & availability'
                      : view === 'history'
                        ? 'Call history'
                        : 'From call to kitchen.'}
                </h1>
                <p>
                  {view === 'orders'
                    ? 'Keep the kitchen moving. Let the agent answer the phone.'
                    : view === 'menu'
                      ? 'The menu is the source of truth for every order.'
                      : view === 'history'
                        ? 'Every request has a trail. Every order has a next step.'
                        : 'A small, focused system built around a real restaurant problem.'}
                </p>
              </div>
              <label className="store-control">
                <span className={'status-dot ' + state.store?.mode.toLowerCase()} />
                <select
                  aria-label="Restaurant status"
                  value={state.store?.mode}
                  disabled={busy}
                  onChange={(e) => void act('store', { mode: e.target.value }, 'PATCH')}
                >
                  <option value="OPEN">Accepting orders</option>
                  <option value="BUSY">Kitchen is busy</option>
                  <option value="CLOSED">Restaurant closed</option>
                </select>
              </label>
            </div>
            {view === 'orders' && (
              <>
                <div className="overview-strip">
                  <div>
                    <span className="overview-icon">
                      <Icon name="layers" />
                    </span>
                    <div>
                      <span>Active orders</span>
                      <strong>{String(active.length).padStart(2, '0')}</strong>
                    </div>
                    <small>In this workspace</small>
                  </div>
                  <div>
                    <span className="overview-icon amber">
                      <Icon name="check" />
                    </span>
                    <div>
                      <span>Ready for pickup</span>
                      <strong>
                        {String(orders.filter((o) => o.status === 'READY').length).padStart(2, '0')}
                      </strong>
                    </div>
                    <small>Awaiting customers</small>
                  </div>
                  <div>
                    <span className="overview-icon">
                      <Icon name="clock" />
                    </span>
                    <div>
                      <span>Pickup estimate</span>
                      <strong>
                        {state.store?.mode === 'BUSY' ? '35' : '20'} <em>min</em>
                      </strong>
                    </div>
                    <small>{state.store?.mode === 'CLOSED' ? 'Ordering paused' : 'Pay at pickup'}</small>
                  </div>
                </div>
                <div className="operations-layout">
                  <section className="order-board" aria-label="Order board">
                    <div className="section-title">
                      <h2>Live order board</h2>
                      <span className="subtle-label">
                        <span className="tiny-dot" />
                        Updates automatically
                      </span>
                    </div>
                    <div className="board-columns">
                      {[
                        { title: 'New', statuses: ['NEW'], color: 'green' },
                        { title: 'Preparing', statuses: ['ACCEPTED', 'IN_PROGRESS'], color: 'orange' },
                        { title: 'Ready', statuses: ['READY'], color: 'blue' }
                      ].map((column) => (
                        <div className={'board-column ' + column.color} key={column.title}>
                          <div className="column-heading">
                            <h3>
                              <span className="column-dot" />
                              {column.title}
                            </h3>
                            <span>{orders.filter((o) => column.statuses.includes(o.status)).length}</span>
                          </div>
                          {orders
                            .filter((o) => column.statuses.includes(o.status))
                            .map((order) => (
                              <OrderCard
                                key={order.id}
                                order={order}
                                disabled={busy || expired}
                                onDetail={() => setDetailId(order.id)}
                                onNext={() =>
                                  void act(
                                    'orders/' + order.id,
                                    { status: nextStatus[order.status].status },
                                    'PATCH'
                                  )
                                }
                              />
                            ))}
                          {!orders.some((o) => column.statuses.includes(o.status)) && (
                            <div className="empty-column">
                              <Icon name="check" />
                              <p>All clear here.</p>
                              <small>Orders appear as they move.</small>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="board-footnote">
                      <Icon name="book" size={15} />
                      <span>Four sample orders are included. Start a call to add your own.</span>
                    </div>
                  </section>
                  <aside className="call-panel" aria-label="Call workspace">
                    <div className="call-panel-heading">
                      <span className="call-symbol">
                        <Icon name="phone" size={19} />
                      </span>
                      <div>
                        <h2>Call workspace</h2>
                        <p>See an order come to life</p>
                      </div>
                      <span className="sample-pill">Sample</span>
                    </div>
                    {!call ? (
                      <div className="call-welcome">
                        <div className="waveform" aria-hidden="true">
                          {Array.from({ length: 17 }, (_, i) => (
                            <i
                              key={i}
                              style={{
                                height: [12, 22, 34, 18, 46, 30, 56, 38, 64, 38, 56, 30, 46, 18, 34, 22, 12][
                                  i
                                ]
                              }}
                            />
                          ))}
                        </div>
                        <h3>
                          Your next order
                          <br />
                          starts with a conversation.
                        </h3>
                        <p>Walk through a sample call and watch it reach the kitchen.</p>
                        <label>
                          CHOOSE A SCENARIO
                          <select
                            aria-label="Sample call scenario"
                            value={scenario}
                            onChange={(e) => setScenario(e.target.value)}
                          >
                            <option value="pickup">Pickup order</option>
                            <option value="unavailable">Unavailable item</option>
                            <option value="handoff">Talk to a person</option>
                          </select>
                        </label>
                        <button
                          className="primary-button start-call"
                          disabled={busy || expired}
                          onClick={() => void act('scenario', { scenario })}
                        >
                          <Icon name="play" size={16} />
                          Start sample call
                        </button>
                        <span className="call-note">Guided simulation · no microphone needed</span>
                      </div>
                    ) : (
                      <>
                        <div className="call-status">
                          <span className={'status-dot ' + (call.phase === 'talking' ? 'pulse' : '')} />
                          <strong>
                            {call.phase === 'talking'
                              ? 'Sample call in progress'
                              : call.phase === 'confirmation'
                                ? 'Waiting for confirmation'
                                : call.phase === 'handoff'
                                  ? 'Staff handoff requested'
                                  : 'Order sent to the kitchen'}
                          </strong>
                        </div>
                        <div className="transcript" ref={transcript} aria-live="polite">
                          {call.messages.map((message, i) => (
                            <div className={'message ' + message.role} key={i}>
                              <span>{message.role === 'agent' ? 'CALL AGENT' : 'CUSTOMER'}</span>
                              <p>{message.text}</p>
                            </div>
                          ))}
                        </div>
                        <div className="call-controls">
                          {call.phase === 'talking' && (
                            <>
                              <button
                                className="primary-button"
                                disabled={busy || expired}
                                onClick={() => void act('next', { step: call.cursor })}
                              >
                                Next turn <Icon name="arrow" size={16} />
                              </button>
                              <button
                                className="secondary-button"
                                disabled={expired}
                                onClick={() => setPlaying(!playing)}
                              >
                                <Icon name={playing ? 'pause' : 'play'} size={15} />
                                {playing ? 'Pause' : 'Play call'}
                              </button>
                            </>
                          )}
                          {call.phase === 'confirmation' && (
                            <>
                              <div className="confirm-summary">
                                <span>
                                  2 × Sesame chicken
                                  <br />1 × Spring rolls
                                </span>
                                <strong>$35.50</strong>
                              </div>
                              <button
                                className="primary-button"
                                disabled={busy || expired}
                                onClick={() => void act('confirm', { callId: call.id })}
                              >
                                <Icon name="check" size={16} />
                                Confirm order
                              </button>
                            </>
                          )}
                          {['complete', 'handoff'].includes(call.phase) && (
                            <>
                              <p className="call-outcome">
                                {call.phase === 'complete'
                                  ? 'The new order is on the board. Try accepting it and moving it through the kitchen.'
                                  : 'A handoff event was recorded. No order was created and no real phone call was transferred.'}
                              </p>
                              <button
                                className="secondary-button"
                                disabled={busy || expired}
                                onClick={() => {
                                  setPlaying(false);
                                  void act('scenario', { scenario: 'pickup' });
                                }}
                              >
                                Try another pickup call <Icon name="arrow" size={15} />
                              </button>
                            </>
                          )}
                          <small>Scripted conversation · live application state</small>
                        </div>
                      </>
                    )}
                  </aside>
                </div>
              </>
            )}
            {view === 'menu' && (
              <section className="menu-panel">
                <div className="section-title">
                  <h2>Pickup menu</h2>
                  <span>{state.menu.length} items · prices set by the restaurant</span>
                </div>
                <div className="menu-grid">
                  {state.menu.map((item: MenuItem) => (
                    <div className="menu-item" data-testid="menu-item" key={item.id}>
                      <span className="menu-monogram">
                        {item.name
                          .split(' ')
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                      <div>
                        <h3>{item.name}</h3>
                        <p>{money(item.basePriceCents)}</p>
                      </div>
                      <button
                        role="switch"
                        aria-label={item.name + ' availability'}
                        aria-checked={item.isAvailable}
                        className={'availability-switch ' + (item.isAvailable ? 'on' : '')}
                        disabled={busy || expired}
                        onClick={() =>
                          void act('menu/' + item.id, { isAvailable: !item.isAvailable }, 'PATCH')
                        }
                      >
                        <span />
                      </button>
                      <small>{item.isAvailable ? 'Available' : 'Sold out'}</small>
                    </div>
                  ))}
                </div>
                <p className="panel-note">
                  Changes apply to your sample workspace immediately. Unavailable items cannot be submitted in
                  an order.
                </p>
              </section>
            )}
            {view === 'history' && (
              <section className="history-panel">
                <div className="section-title">
                  <h2>Completed orders</h2>
                  <span>{completed.length} in this session</span>
                </div>
                {completed.length ? (
                  completed.map((order) => (
                    <button className="history-row" key={order.id} onClick={() => setDetailId(order.id)}>
                      <span className="history-check">
                        <Icon name="check" />
                      </span>
                      <span>
                        <strong>{order.customerName}</strong>
                        <small>
                          #{order.orderNumber} · {statusLabel[order.status]}
                        </small>
                      </span>
                      <strong>{money(order.totalCents)}</strong>
                      <Icon name="arrow" size={16} />
                    </button>
                  ))
                ) : (
                  <div className="history-empty">
                    <Icon name="clock" size={30} />
                    <h3>A clear view of what happened.</h3>
                    <p>Complete an order on the board to see it here.</p>
                  </div>
                )}
                <h2 className="timeline-title">Activity trail</h2>
                <div className="activity-list">
                  {[...state.events]
                    .reverse()
                    .slice(0, 20)
                    .map((event: OrderEvent) => (
                      <div key={event.id}>
                        <span className="activity-dot" />
                        <p>
                          <strong>{event.eventType.replace(/([a-z])([A-Z])/g, '$1 $2')}</strong>
                          <small>
                            {event.orderId} ·{' '}
                            {event.payload.reason
                              ? String(event.payload.reason)
                              : event.payload.toStatus
                                ? statusLabel[String(event.payload.toStatus)]
                                : 'Recorded in your sample workspace'}
                          </small>
                        </p>
                        <time>
                          {new Date(event.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </time>
                      </div>
                    ))}
                </div>
              </section>
            )}
            {view === 'about' && (
              <section className="about-panel">
                <div className="about-intro">
                  <span className="about-kicker">BUILT FOR THE DINNER RUSH</span>
                  <h2>
                    Less time on the phone.
                    <br />
                    More attention on the food.
                  </h2>
                  <p>
                    I built this project around a problem I saw in my parents’ restaurant: taking phone orders
                    pulls people away from the counter and the kitchen. This workspace makes the handoff from
                    conversation to order visible.
                  </p>
                  <span className="author-line">Ivan Chen · Software & AI engineering</span>
                </div>
                <div className="architecture-flow">
                  {[
                    [
                      'phone',
                      '01',
                      'Conversation',
                      'Twilio + OpenAI Realtime in the voice integration; scripted turns in this demo.'
                    ],
                    [
                      'menu',
                      '02',
                      'Validate',
                      'The menu owns prices and availability. Orders require an explicit confirmation.'
                    ],
                    [
                      'layers',
                      '03',
                      'Create once',
                      'Shared order services, retry-safe IDs, status transitions, and an event trail.'
                    ],
                    [
                      'grid',
                      '04',
                      'Run the kitchen',
                      'Staff accept, prepare, and complete orders. This demo streams updates with a polling fallback.'
                    ]
                  ].map(([icon, number, title, description]) => (
                    <article key={number}>
                      <span className="architecture-number">{number}</span>
                      <Icon name={icon} size={24} />
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </article>
                  ))}
                </div>
                <div className="about-boundaries">
                  <h3>What you’re trying</h3>
                  <p>
                    A deployable product demonstration with isolated, temporary sample data and a real
                    TypeScript backend. Conversations are scripted; this demo does not place calls, process
                    payments, or connect to a production restaurant.
                  </p>
                  <a
                    className="primary-button"
                    href="https://github.com/ichen27/restaurant-call-agent"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read the engineering details <Icon name="arrow" size={16} />
                  </a>
                </div>
              </section>
            )}
          </main>
        )}
        <footer className="workspace-footer">
          <span>Restaurant Call Agent</span>
          <span>Pickup orders, thoughtfully handled.</span>
          <span>Sample data only</span>
        </footer>
      </div>
      {selected && (
        <div className="drawer-overlay" onClick={() => setDetailId(null)}>
          <section
            className="order-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={'Order ' + selected.orderNumber}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="drawer-close"
              autoFocus
              aria-label="Close order details"
              onClick={() => setDetailId(null)}
            >
              <Icon name="close" />
            </button>
            <span className="eyebrow">ORDER DETAILS</span>
            <h2>#{selected.orderNumber}</h2>
            <p>{selected.customerName} · Pay at pickup</p>
            <span className="order-status">{statusLabel[selected.status]}</span>
            <div className="receipt-items">
              {selected.items.map((item) => (
                <div key={item.itemId}>
                  <span>
                    {item.qty} × {item.itemNameSnapshot}
                  </span>
                  <strong>{money(item.lineTotalCents)}</strong>
                </div>
              ))}
              <div className="receipt-total">
                <span>Total</span>
                <strong>{money(selected.totalCents)}</strong>
              </div>
            </div>
            <h3>Order timeline</h3>
            <div className="drawer-timeline">
              {state?.events
                .filter((e) => e.orderId === selected.id)
                .map((e) => (
                  <div key={e.id}>
                    <span className="status-dot" />
                    <span>
                      {e.eventType.replace(/([a-z])([A-Z])/g, '$1 $2')}
                      <small>{new Date(e.createdAt).toLocaleTimeString()}</small>
                    </span>
                  </div>
                ))}
            </div>
            {nextStatus[selected.status] && (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() =>
                  void act('orders/' + selected.id, { status: nextStatus[selected.status].status }, 'PATCH')
                }
              >
                {nextStatus[selected.status].label}
                <Icon name="arrow" size={16} />
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function OrderCard({
  order,
  disabled,
  onDetail,
  onNext
}: {
  order: Order;
  disabled: boolean;
  onDetail: () => void;
  onNext: () => void;
}) {
  const age = Math.max(0, Math.floor((Date.now() - Date.parse(order.createdAt)) / 60000));
  return (
    <article className={'order-card ' + (order.callId ? 'fresh-order' : '')} data-testid="order-card">
      <button className="card-main" onClick={onDetail} aria-label={'View order ' + order.orderNumber}>
        <div className="card-top">
          <strong>#{order.orderNumber}</strong>
          <span>
            <Icon name="clock" size={12} />
            {age === 0 ? 'Just now' : age + ' min'}
          </span>
        </div>
        <h4>{order.customerName}</h4>
        <span className="order-channel">
          <Icon name="phone" size={12} />
          {order.callId ? 'Sample call' : 'Sample order'}
          <span>Pickup</span>
        </span>
        <div className="card-items">
          {order.items.map((item) => (
            <p key={item.itemId}>
              <span className="item-qty">{item.qty}×</span>
              {item.itemNameSnapshot}
            </p>
          ))}
        </div>
        <div className="card-total">
          <span>{order.items.reduce((n, item) => n + item.qty, 0)} items</span>
          <strong>{money(order.totalCents)}</strong>
        </div>
      </button>
      <button
        className={'order-action ' + (order.status === 'NEW' ? 'solid' : '')}
        disabled={disabled}
        onClick={onNext}
      >
        {nextStatus[order.status]?.label}
        <Icon name={order.status === 'READY' ? 'check' : 'arrow'} size={15} />
      </button>
    </article>
  );
}
