import { Injectable, signal } from '@angular/core';

// Credenciales almacenadas como hashes SHA-256 (nunca en texto plano).
// Usuario: sha256('zenners') — se compara en minúsculas, sin importar mayúsculas.
// Contraseña: sha256 de la contraseña real.
const USUARIO_HASH = 'f97047cd2d0bd14008e154790d13864364cbe7d76b40a0844bb7ceba83ad06c5';
const PASSWORD_HASH = 'c68317d6abefa068e1887c1680d52f7100f15140e503b65850ceb5cf9f9332b4';
const SESSION_KEY = 'taller_auth_session';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  isAuthenticated = signal(false);
  usuarioActual = signal<string | null>(null);
  authReady = signal(false);
  errorMsg = signal<string | null>(null);

  constructor() {
    const sesion = localStorage.getItem(SESSION_KEY);
    if (sesion) {
      this.usuarioActual.set(sesion);
      this.isAuthenticated.set(true);
    }
    this.authReady.set(true);
  }

  private async hash256(texto: string): Promise<string> {
    const data = new TextEncoder().encode(texto);
    const buffer = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buffer)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async login(usuario: string, password: string): Promise<boolean> {
    this.errorMsg.set(null);
    try {
      const usuarioNormalizado = usuario.trim().toLowerCase();
      const [uHash, pHash] = await Promise.all([
        this.hash256(usuarioNormalizado),
        this.hash256(password)
      ]);

      if (uHash === USUARIO_HASH && pHash === PASSWORD_HASH) {
        localStorage.setItem(SESSION_KEY, usuarioNormalizado);
        this.usuarioActual.set(usuarioNormalizado);
        this.isAuthenticated.set(true);
        return true;
      }

      this.errorMsg.set('Usuario o contraseña incorrectos');
      return false;
    } catch {
      this.errorMsg.set('Error al iniciar sesión');
      return false;
    }
  }

  logout(): void {
    localStorage.removeItem(SESSION_KEY);
    this.usuarioActual.set(null);
    this.isAuthenticated.set(false);
  }
}
