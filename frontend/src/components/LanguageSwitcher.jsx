const LANGS = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
]

export default function LanguageSwitcher({ lang, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: 3,
      background: '#f0f0f0', borderRadius: 8, padding: 3,
    }}>
      {LANGS.map(l => (
        <button
          key={l.code}
          onClick={() => onChange(l.code)}
          style={{
            padding: '4px 10px', border: 'none', borderRadius: 6,
            fontSize: 11, cursor: 'pointer',
            fontWeight: lang === l.code ? 600 : 400,
            background: lang === l.code ? '#fff' : 'transparent',
            color: lang === l.code ? '#534AB7' : '#888',
            boxShadow: lang === l.code ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
            transition: 'all .15s',
          }}
        >
          {l.flag} {l.label}
        </button>
      ))}
    </div>
  )
}