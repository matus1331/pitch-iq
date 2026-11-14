import { X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MAX_LEVEL, TITLES } from '@shared/level.ts'

const STEPS = [
  { title: 'Tipuj zápasy kola', text: 'Pri každom zápase vyber víťaza alebo remízu (2 IQ), alebo trafíš presný výsledok (5 IQ). Tip môžeš meniť až do výkopu.' },
  { title: 'Vyber tri tipy pre svoj klub', text: 'V záložke Môj klub dostaneš ku každému zápasu šesť tipov, napríklad kto dá gól. Vyber si tri, body sú za tie, ktoré vyjdú.' },
  { title: 'Zbieraj IQ a vyzývaj kamošov', text: 'Za IQ stúpaš v leveloch. V záložke Duely vyzveš kamoša: kto v kole naberie viac IQ, berie stávku.' },
]

/** The rules on one page: three steps first, details after. */
export function HowToPlay() {
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
        <p><b>Klubové tipy:</b> šestica sa losuje na každé kolo a je rovnaká pre všetkých. Klub si vyberáš raz na celú sezónu.</p>
        <p><b>Duely:</b> hráte buď o Zápasy, alebo o Klub. Stávka je 5, 10 alebo 20 IQ a obaja v tej kategórii musíte mať aspoň toľko voľného IQ. Súper musí výzvu prijať pred začiatkom kola. Ak vyhrá hráč s nižším levelom, dostane navyše polovicu stávky.</p>
        <p><b>Levely:</b> od 1 po {MAX_LEVEL}. Level nikdy neklesne, ani keď prehráš duel. Tituly: {TITLES.map((t) => t.title).join(', ')}.</p>
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
