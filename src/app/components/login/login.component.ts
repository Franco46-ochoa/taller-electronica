import { Component, inject, effect } from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  auth = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  submitting = false;

  formularioLogin = this.fb.group({
    usuario: ['', Validators.required],
    password: ['', Validators.required]
  });

  constructor() {
    effect(() => {
      if (this.auth.authReady() && this.auth.isAuthenticated()) {
        this.router.navigate(['/dashboard']);
      }
    });
  }

  async login() {
    if (this.formularioLogin.invalid) {
      this.formularioLogin.markAllAsTouched();
      return;
    }
    this.submitting = true;
    const f = this.formularioLogin.value;
    const ok = await this.auth.login(f.usuario || '', f.password || '');
    this.submitting = false;
    if (ok) this.router.navigate(['/dashboard']);
  }
}
