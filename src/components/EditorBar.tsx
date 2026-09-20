import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface EditorBarProps {
  isEditor: boolean;
  onToggleEditorMode: (enabled: boolean) => void;
}

/**
 * Barra de acceso de editor.
 * - Sin sesión: muestra botón "Iniciar sesión" que abre modal (contraseña o enlace mágico).
 * - Con sesión: muestra correo del usuario + botón "Cerrar sesión".
 * - El modo editor se activa automáticamente al iniciar sesión y se desactiva al cerrar.
 */
export const EditorBar: React.FC<EditorBarProps> = ({
  // isEditor se usa internamente a través del estado de sesión (userEmail)
  isEditor: _isEditor,
  onToggleEditorMode
}) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMsg, setAuthMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Pestaña activa en el modal: 'password' o 'magic'
  const [authTab, setAuthTab] = useState<'password' | 'magic'>('password');

  // Comprobar sesión de Supabase al montar
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserEmail(session.user.email || 'Editor');
        onToggleEditorMode(true);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserEmail(session.user.email || 'Editor');
        onToggleEditorMode(true);
      } else {
        setUserEmail(null);
        onToggleEditorMode(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [onToggleEditorMode]);

  // Inicio de sesión con correo y contraseña
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setAuthMsg({
            text: 'Credenciales incorrectas. Verifica tu correo y contraseña.',
            isError: true
          });
        } else {
          setAuthMsg({ text: error.message, isError: true });
        }
      } else if (data.session) {
        setAuthMsg({ text: '✓ Sesión iniciada con éxito.', isError: false });
        setTimeout(() => setShowAuthModal(false), 800);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthMsg({ text: msg, isError: true });
    } finally {
      setAuthLoading(false);
    }
  };

  // Registro de nuevo editor (correo + contraseña)
  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      setAuthMsg({ text: 'Escribe correo y contraseña para registrarte.', isError: true });
      return;
    }
    setAuthLoading(true);
    setAuthMsg(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password
      });

      if (error) {
        setAuthMsg({ text: error.message, isError: true });
      } else if (data.user) {
        setAuthMsg({
          text: '✓ Usuario registrado. Un administrador debe asignarle el rol editor en Supabase.',
          isError: false
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthMsg({ text: msg, isError: true });
    } finally {
      setAuthLoading(false);
    }
  };

  // Enviar enlace mágico al correo
  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setAuthMsg({ text: 'Escribe tu correo electrónico.', isError: true });
      return;
    }
    setAuthLoading(true);
    setAuthMsg(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim()
      });

      if (error) {
        setAuthMsg({ text: error.message, isError: true });
      } else {
        setAuthMsg({
          text: '✓ Enlace enviado a tu correo. Revisa tu bandeja de entrada (y spam).',
          isError: false
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthMsg({ text: msg, isError: true });
    } finally {
      setAuthLoading(false);
    }
  };

  // Cerrar sesión
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserEmail(null);
    onToggleEditorMode(false);
  };

  // Resetear estado del modal al abrirlo
  const openModal = () => {
    setAuthMsg(null);
    setEmail('');
    setPassword('');
    setAuthTab('password');
    setShowAuthModal(true);
  };

  // Estilos del tab activo
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    fontSize: '13px',
    border: 'none',
    borderBottom: active ? '2px solid var(--link, #3366cc)' : '2px solid transparent',
    background: 'transparent',
    color: active ? 'var(--link, #3366cc)' : 'var(--muted, #72777d)',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer'
  });

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
      {userEmail ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <b style={{ color: 'var(--success, #1a7f37)' }}>●</b>
          <span title="Sesión activa como editor">{userEmail}</span>
          <button
            type="button"
            className="btn"
            onClick={handleLogout}
            style={{ fontSize: '12px' }}
          >
            Cerrar sesión
          </button>
        </span>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--muted, #72777d)' }}>
          <span style={{ opacity: 0.6 }}>○</span>
          <span>Solo lectura</span>
          <button
            type="button"
            className="btn"
            onClick={openModal}
            style={{ fontWeight: 500 }}
          >
            Iniciar sesión
          </button>
        </span>
      )}

      {/* Modal de autenticación */}
      {showAuthModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
          onClick={() => setShowAuthModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--line, #a2a9b1)',
              padding: '24px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--line)', paddingBottom: '6px' }}>
              Acceso de Editor
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
              Inicia sesión para poder crear, editar y eliminar empresas en el directorio.
            </p>

            {/* Tabs: Contraseña / Enlace mágico */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: '16px' }}>
              <button type="button" style={tabStyle(authTab === 'password')} onClick={() => setAuthTab('password')}>
                Contraseña
              </button>
              <button type="button" style={tabStyle(authTab === 'magic')} onClick={() => setAuthTab('magic')}>
                Enlace mágico
              </button>
            </div>

            {/* Formulario de contraseña */}
            {authTab === 'password' && (
              <form onSubmit={handleLogin}>
                <label style={{ display: 'block', fontSize: '13.5px', marginBottom: '10px' }}>
                  Correo electrónico
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ width: '100%', marginTop: '3px', padding: '6px', border: '1px solid var(--line)', boxSizing: 'border-box' }}
                    required
                    autoComplete="email"
                  />
                </label>
                <label style={{ display: 'block', fontSize: '13.5px', marginBottom: '14px' }}>
                  Contraseña
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ width: '100%', marginTop: '3px', padding: '6px', border: '1px solid var(--line)', boxSizing: 'border-box' }}
                    required
                    autoComplete="current-password"
                  />
                </label>

                {authMsg && (
                  <div style={{ fontSize: '12.5px', color: authMsg.isError ? '#b32424' : '#1a7f37', marginBottom: '12px' }}>
                    {authMsg.text}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="submit" className="primary" disabled={authLoading}>
                    {authLoading ? 'Conectando…' : 'Iniciar sesión'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleSignUp}
                    disabled={authLoading}
                  >
                    Registrarme
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowAuthModal(false)}
                    style={{ marginLeft: 'auto' }}
                  >
                    Cerrar
                  </button>
                </div>
              </form>
            )}

            {/* Formulario de enlace mágico */}
            {authTab === 'magic' && (
              <form onSubmit={handleMagicLink}>
                <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>
                  Te enviaremos un enlace de acceso a tu correo electrónico. Solo haz clic en el enlace para iniciar sesión sin contraseña.
                </p>
                <label style={{ display: 'block', fontSize: '13.5px', marginBottom: '14px' }}>
                  Correo electrónico
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ width: '100%', marginTop: '3px', padding: '6px', border: '1px solid var(--line)', boxSizing: 'border-box' }}
                    required
                    autoComplete="email"
                  />
                </label>

                {authMsg && (
                  <div style={{ fontSize: '12.5px', color: authMsg.isError ? '#b32424' : '#1a7f37', marginBottom: '12px' }}>
                    {authMsg.text}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="submit" className="primary" disabled={authLoading}>
                    {authLoading ? 'Enviando…' : 'Enviar enlace mágico'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowAuthModal(false)}
                    style={{ marginLeft: 'auto' }}
                  >
                    Cerrar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
