import { Component, inject, effect } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  auth = inject(AuthService);
  private router = inject(Router);
  submitting = false;

  constructor() {
    effect(() => {
      if (this.auth.authReady() && this.auth.isAuthenticated()) {
        this.router.navigate(['/dashboard']);
      }
    });
  }

  async login() {
    this.submitting = true;
    const ok = await this.auth.loginWithGoogle();
    this.submitting = false;
    if (ok) this.router.navigate(['/dashboard']);
  }
}
