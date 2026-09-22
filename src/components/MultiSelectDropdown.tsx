import React, { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string;
  options: Option[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  minWidth?: string;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label,
  options,
  selected,
  onChange,
  minWidth = '200px'
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleValue = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const summary =
    selected.size === 0
      ? label
      : selected.size === 1
      ? options.find((o) => o.value === [...selected][0])?.label || `1 seleccionada`
      : `${selected.size} seleccionadas`;

  const buttonStyle: React.CSSProperties = {
    fontSize: '13px',
    padding: '6px 10px',
    border: '1px solid var(--line)',
    borderRadius: '2px',
    background: '#fff',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    minWidth,
    justifyContent: 'space-between'
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" style={buttonStyle} onClick={() => setOpen((o) => !o)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 50,
            background: '#fff',
            border: '1px solid var(--line)',
            borderRadius: '3px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            minWidth: '260px',
            maxHeight: '280px',
            overflowY: 'auto',
            padding: '8px'
          }}
        >
          <div style={{ display: 'flex', gap: '10px', marginBottom: '6px', fontSize: '12px' }}>
            <button
              type="button"
              className="btn"
              style={{ padding: '2px 6px', fontSize: '11.5px' }}
              onClick={() => onChange(new Set(options.map((o) => o.value)))}
            >
              Todas
            </button>
            <button
              type="button"
              className="btn"
              style={{ padding: '2px 6px', fontSize: '11.5px' }}
              onClick={() => onChange(new Set())}
            >
              Ninguna
            </button>
          </div>
          {options.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12.5px',
                padding: '3px 4px',
                cursor: 'pointer'
              }}
            >
              <input type="checkbox" checked={selected.has(opt.value)} onChange={() => toggleValue(opt.value)} />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
