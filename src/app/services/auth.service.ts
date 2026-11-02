import { Injectable, signal } from '@angular/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { firebaseConfig } from '../../environments/firebase';

const WHITELIST: string[] = [
  'electronica.zenner@gmail.com',
  // TODO: agregar los correos autorizados restantes
];

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth;

  isAuthenticated = signal(false);
  currentUser = signal<User | null>(null);
  authReady = signal(false);
  errorMsg = signal<string | null>(null);

  constructor() {
    this.auth = getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig));
    onAuthStateChanged(this.auth, (user) => {
      if (user && this.estaAutorizado(user.email)) {
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
      } else {
        this.currentUser.set(null);
        this.isAuthenticated.set(false);
      }
      this.authReady.set(true);
    });
  }

  estaAutorizado(email: string | null): boolean {
    return !!email && WHITELIST.includes(email.toLowerCase());
  }

  async loginWithGoogle(): Promise<boolean> {
    this.errorMsg.set(null);
    try {
      let email: string | null = null;

      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        const idToken = result.credential?.idToken;
        if (!idToken) throw new Error('No se obtuvo credencial de Google');
        const credential = GoogleAuthProvider.credential(idToken);
        const userCred = await signInWithCredential(this.auth, credential);
        email = userCred.user.email;
      } else {
        const provider = new GoogleAuthProvider();
        const userCred = await signInWithPopup(this.auth, provider);
        email = userCred.user.email;
      }

      if (!this.estaAutorizado(email)) {
        await signOut(this.auth);
        this.errorMsg.set('No estás autorizado para acceder');
        return false;
      }
      return true;
    } catch (error: any) {
      if (error?.code !== 'auth/popup-closed-by-user' && error?.message !== 'The user canceled the sign-in flow.') {
        this.errorMsg.set('Error al iniciar sesión: ' + (error?.message || ''));
      }
      return false;
    }
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }
}
