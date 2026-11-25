import { X } from 'lucide-react'
import { useState } from 'react'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MAX_LEVEL, TITLES } from '@shared/level.ts'
import { DUELS_ENABLED } from '@/lib/features'

const STEPS = [
  { title: 'Tipuj zápasy kola', text: 'Pri každom zápase tipni presný výsledok. Za správneho víťaza alebo remízu dostaneš 3 IQ, za presné skóre ďalšie 3 IQ, spolu 6. Tip 2:2 pri výsledku 0:0 teda dá 3 IQ. Tip môžeš meniť až do výkopu.' },
  { title: 'Tipy a zostava pre svoj klub', text: 'V záložke PL v časti Môj klub si ku každému zápasu vyberieš až tri tipy, napríklad kto dá gól, a zostavíš päť hráčov. Body sú za tipy, ktoré vyjdú, a za výkony tvojich hráčov.' },
  DUELS_ENABLED
    ? { title: 'Zbieraj IQ a vyzývaj kamošov', text: 'Za IQ stúpaš v leveloch. V záložke Duely vyzveš kamoša o Rešpekt: na celé kolo alebo na jeden zápas.' }
    : { title: 'Zbieraj IQ', text: 'Za IQ stúpaš v leveloch a v tabuľkách sa porovnáš s kamošmi.' },
]

// FPL game_config.scoring, per position GK / DEF / MID / FWD.
const LINEUP_POINTS: [string, ...string[]][] = [
  ['Odohrané do 60 min', '1', '1', '1', '1'],
  ['60 min a viac', '2', '2', '2', '2'],
  ['Gól', '10', '6', '5', '4'],
  ['Asistencia', '3', '3', '3', '3'],
  ['Čisté konto', '4', '4', '1', '0'],
  ['Každé 3 zákroky', '1', '–', '–', '–'],
  ['Chytená penalta', '5', '–', '–', '–'],
  ['Obranná práca', '0', '2', '2', '2'],
  ['Bonus', '1 – 3', '1 – 3', '1 – 3', '1 – 3'],
  ['Každé 2 inkasované góly', '−1', '−1', '0', '0'],
  ['Nepremenená penalta', '−2', '−2', '−2', '−2'],
  ['Žltá karta', '−1', '−1', '−1', '−1'],
  ['Červená karta', '−3', '−3', '−3', '−3'],
  ['Vlastný gól', '−2', '−2', '−2', '−2'],
]

/** The rules on one page: three steps first, details after. */
export function HowToPlay() {
  // Links like /pravidla#tabulka land on their explanation (the router does not scroll to anchors itself).
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])
  return (
    <section className="space-y-4">
      <h1 className="font-heading text-4xl leading-none">Ako sa hrá</h1>
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4 rounded-xl bg-white p-4 text-neutral-900 shadow-md">
            <span className="scoreboard flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--club-primary)] text-xl text-[var(--club-text)]">{i + 1}</span>
            <div>
              <h2 className="font-semibold">{s.title}</h2>
              <p className="text-sm text-neutral-600">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-3 rounded-xl bg-white p-4 text-sm text-neutral-700 shadow-md">
        <h2 className="text-base font-semibold text-neutral-900">Podrobnosti</h2>
        <p><b>Kedy sa tip zamkne:</b> každý zápas pri svojom výkope. Tipy ostatných uvidíš až potom.</p>
        <p><b>Kedy pribudnú body:</b> do pár minút po skončení zápasu. Počas zápasu sú predbežné.</p>
        <p><b>Klubové tipy:</b> ku každému zápasu tvojho klubu ponúkame všetky tipy, rozdelené do kategórií: Góly, Karty, Obrana, Výkon a Zvláštnosti zápasu. Vyberieš si najviac 3 na zápas. Klub si vyberáš raz na celú sezónu.</p>
        <p><b>Zostava:</b> vyberieš 5 hráčov, voľné miesto môže byť z poľa. Zraneného ani suspendovaného hráča vybrať nejde. Zostava sa pri výkope prenáša z minulého kola. 1 FPL bod = 1 IQ, a keďže body môžu byť aj záporné, IQ môže klesnúť, ale level nikdy neklesne.</p>
        <table className="w-full text-left">
          <thead className="text-xs text-neutral-500"><tr><th scope="col" className="py-1">Čo hráč urobí</th><th scope="col" className="text-center">GK</th><th scope="col" className="text-center">DEF</th><th scope="col" className="text-center">MID</th><th scope="col" className="text-center">FWD</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {LINEUP_POINTS.map(([what, ...v]) => (
              <tr key={what}><td className="py-1">{what}</td>{v.map((x, i) => <td key={i} className="text-center">{x}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-neutral-500">Obranná práca: pri DEF za 10 odkopov, blokov, zákrokov a zachytení, pri MID a FWD za 12, keď sa ráta aj získanie lopty. Zákroky sa rátajú len brankárovi.</p>
        {DUELS_ENABLED && <>
        <p><b>Duely:</b> hrajú sa o Rešpekt (R), samostatnú menu, ktorá IQ ani level nemení. Každý začína so 100 R a za každé kolo, v ktorom natipuje všetky zápasy, dostane +5 R. Stávka je 5, 10 alebo 20 R a duel začne, len keď obaja máte aspoň 10 voľného R.</p>
        <p><b>Duel o kolo:</b> kto v kole naberie viac IQ za tipy zápasov, berie stávku. Súper musí výzvu prijať pred začiatkom kola. Ak vyhrá hráč s nižším levelom, dostane navyše polovicu stávky. Duely o Môj klub pripravujeme.</p>
        <p><b>Duel o zápas:</b> súper prijme so svojím tipom na zápas a ty uvidíš len jeho stranu (1, X alebo 2), nikdy presné skóre. Potom si vyberieš jednu zo zvyšných strán (výhra aj prehra je celá stávka; ak padne tretí výsledok, nikto nič nezíska), alebo dvojtip bez jeho strany, ktorý vyhrá len polovicu stávky, ale prehrá celú. Alebo duel odmietneš, no zaráta sa ti medzi 3 zápasové duely kola a na ten zápas už toho hráča nevyzveš. Súper po prijatí môže meniť skóre, ale nie víťaza.</p>
        </>}
        <p><b>Liga majstrov:</b> samostatná súťaž v záložke LM, vlastnú tabuľku má v záložke Tabuľky. Body sú rovnaké ako pri Premier League, vo vyraďovacej časti platí skóre po 90 minútach. IQ z Ligy majstrov sa do levelu ani do tabuliek Premier League neráta.</p>
        <p><b>Levely:</b> od 1 po {MAX_LEVEL}. Level nikdy neklesne: aj keď IQ po záporných bodoch zostavy klesne, level sa drží podľa najvyššieho dosiahnutého IQ. Nový titul dostaneš každých 5 levelov: {TITLES.map((t) => t.title).join(', ')}.</p>
      </div>
      <div id="tabulka" className="scroll-mt-4 space-y-3 rounded-xl bg-white p-4 text-sm text-neutral-700 shadow-md">
        <h2 className="text-base font-semibold text-neutral-900">Čo je v tabuľke</h2>
        <p>V tabuľkách Premier League a Liga majstrov je pri každom hráčovi rozpis jeho tipov na výsledky zápasov. V tabuľke Môj klub sú body za klubové tipy a zostavu spolu, pri hráčovi vidíš aj „z toho zostava“.</p>
        <ul className="space-y-1.5">
          <li><b>🎯 Presný výsledok:</b> koľkokrát trafil skóre presne (6 IQ).</li>
          <li><b>✓ Správny víťaz alebo remíza:</b> správny výsledok zápasu, ale skóre nesedelo (3 IQ).</li>
          <li><b>✗ Netrafené:</b> tip bol zlý (0 IQ).</li>
          <li><b>Ø Priemerná chyba:</b> o koľko gólov sa hráč v priemere pomýlil na jeden tip.</li>
        </ul>
        <p>
          <b>Ako sa počíta Ø:</b> pri každom tipe sa sčíta, o koľko sa pomýlil v góloch domácich a o koľko v góloch hostí.
          Čím menej, tým lepšie, 0 znamená presný tip. Ak zápas skončil 2:1:
        </p>
        <table className="w-full text-left">
          <thead className="text-xs text-neutral-500"><tr><th scope="col" className="py-1">Tip</th><th scope="col">Výpočet</th><th scope="col">Chyba</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            <tr><td className="py-1">2:1</td><td>0 + 0</td><td><b>0</b></td></tr>
            <tr><td className="py-1">3:2</td><td>1 + 1</td><td><b>2</b></td></tr>
            <tr><td className="py-1">4:0</td><td>2 + 1</td><td><b>3</b></td></tr>
          </tbody>
        </table>
        <p>Ø je priemer týchto chýb zo všetkých odohraných tipov. Ø 2,5 teda znamená, že tvoj tip sa od výsledku líši v priemere o 2,5 gólu v súčte. Staré tipy 1/X/2 (do 11. kola) do Ø nerátame.</p>
        <p>
          <b>Poradie pri rovnosti bodov:</b> rozhoduje viac presných výsledkov 🎯, potom menšia chyba Ø. Ak sa hráči zhodnú vo všetkom,
          ostanú na rovnakom mieste.
        </p>
      </div>
      <Link to="/" className="inline-block font-semibold underline underline-offset-4">Späť na kolo</Link>
    </section>
  )
}

const seenKey = (userId: string) => `pitchiq:welcome-seen:${userId}`

/** A card for players who have not read the rules yet; closing it hides it on this device. */
export function WelcomeCard({ userId }: { userId: string }) {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(seenKey(userId)) === '1' } catch { return false }
  })
  if (hidden) return null
  const close = () => {
    setHidden(true)
    try { localStorage.setItem(seenKey(userId), '1') } catch { /* private mode: the card just comes back */ }
  }
  return (
    <div className="swap-in relative mb-4 rounded-xl bg-white p-4 pr-12 text-neutral-900 shadow-md">
      <p className="font-semibold">Vitaj v PitchIQ!</p>
      <p className="text-sm text-neutral-600">Tipuj zápasy, zbieraj IQ a vyzývaj kamošov. Pravidlá sú na jednu minútu.</p>
      <Link to="/pravidla" onClick={close} className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">Ako sa hrá</Link>
      <button onClick={close} aria-label="Zavrieť" className="absolute top-3 right-3 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100">
        <X className="size-5" />
      </button>
    </div>
  )
}
