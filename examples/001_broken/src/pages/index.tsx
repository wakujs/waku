'use client';
import { Link } from 'waku';

export default function Home() {
  return (
    <>
      <nav style={{ padding: 8 }}>🏠 Home</nav>

      <hr />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: 8,
          gap: 4,
        }}
      >
        <Link to="/book/a%20a" unstable_pending={<div>loading...</div>}>
          ❌ link(/book/a%20a)
          <span style={{ fontSize: 12, opacity: 0.5 }}>
            (with encoded path and unstable_pending, cannot redirect)
          </span>
        </Link>

        <Link to="/book/aa" unstable_pending={<div>loading...</div>}>
          ✅ link(/book/aa)
          <span style={{ fontSize: 12, opacity: 0.5 }}>
            (without encoded path and unstable_pending, can redirect)
          </span>
        </Link>

        <Link to="/book/a%20a">
          ✅ link(/book/a%20a)
          <span style={{ fontSize: 12, opacity: 0.5 }}>
            (with encoded path and without unstable_pending, can redirect)
          </span>
        </Link>
      </div>
    </>
  );
}
