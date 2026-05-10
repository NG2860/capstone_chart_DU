import { useRef } from 'react'

export default function FileUpload({ onUpload }) {
  const ref = useRef()

  const handleChange = (e) => {
    const f = Array.from(e.target.files)
    if (f.length > 0) onUpload(f)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const f = Array.from(e.dataTransfer.files)
    if (f.length > 0) onUpload(f)
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>데이터 소스</p>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => ref.current.click()}
        style={{
          border: '1.5px dashed #AFA9EC', borderRadius: 8,
          padding: '16px 10px', textAlign: 'center',
          cursor: 'pointer', background: '#EEEDFE',
        }}
      >
        <div style={{ fontSize: 12, color: '#534AB7', fontWeight: 500 }}>
          + 파일 업로드
        </div>
        <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
          CSV / Excel / JSON
        </div>
      </div>
      <input
        ref={ref}
        type="file"
        multiple
        accept=".csv,.xlsx,.xls,.json"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}
