import dynamic from 'next/dynamic';
import Head from 'next/head';

const Flustered = dynamic(() => import('../components/Flustered'), {
  ssr: false,
  loading: () => (
    <div style={{
      minHeight: '100vh',
      background: '#0F0A0A',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Georgia, serif',
      color: 'rgba(242,232,220,0.4)',
      fontSize: 14,
      letterSpacing: '0.05em'
    }}>
      loading…
    </div>
  ),
});

export default function Home() {
  return (
    <>
      <Head>
        <title>Flustered — your anxiety companion</title>
        <meta name="description" content="FLUX is here when things get hard. Panic attacks, racing thoughts, 2am anxiety — I got you." />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#0F0A0A" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main style={{
        minHeight: '100vh',
        background: '#0F0A0A',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
      }}>
        <div style={{
          width: '100%',
          maxWidth: 480,
          minHeight: '100vh',
        }}>
          <Flustered />
        </div>
      </main>
      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0F0A0A; overflow-x: hidden; }
        input, textarea, button { font-family: inherit; }
      `}</style>
    </>
  );
}
