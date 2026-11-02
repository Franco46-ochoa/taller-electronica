import { Component, inject, signal, ViewChild, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ReciboService } from '../../services/recibo.service';
import { AuthService } from '../../services/auth.service';
import { Recibo, Balance } from '../../models/recibo.model';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private fb = inject(FormBuilder);
  private servicio = inject(ReciboService);
  auth = inject(AuthService);
  private router = inject(Router);

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  @ViewChild('reciboPrint') reciboPrint!: ElementRef;
  @ViewChild('pdfPrint') pdfPrint!: ElementRef;

  tabActiva = signal<'ingreso' | 'salida' | 'historial' | 'balance' | 'presupuesto'>('ingreso');
  pdfRecibo = signal<Recibo | null>(null);
  pdfTipo = signal<'ingreso' | 'entrega' | 'presupuesto'>('ingreso');

  formularioIngreso: FormGroup = this.fb.group({
    clienteNombre: ['', Validators.required],
    clienteDireccion: ['', Validators.required],
    clienteTelefono: ['', Validators.required],
    aparatoTipo: ['', Validators.required],
    aparatoMarca: ['', Validators.required],
    aparatoModelo: ['', Validators.required],
    aparatoNumSerie: ['', Validators.required],
    observaciones: ['', Validators.required]
  });

  formularioEntrega: FormGroup = this.fb.group({
    buscarId: [''],
    costoReparacion: [0, [Validators.required, Validators.min(0)]],
    observacionesFinales: ['']
  });

  formularioPresupuesto: FormGroup = this.fb.group({
    buscarId: [''],
    diagnostico: ['', Validators.required],
    costo: [0, [Validators.required, Validators.min(0)]]
  });

  filtroHistorial = this.fb.group({
    cliente: [''],
    marca: [''],
    estado: ['']
  });

  formularioEdicion: FormGroup = this.fb.group({
    clienteNombre: ['', Validators.required],
    clienteDireccion: ['', Validators.required],
    clienteTelefono: ['', Validators.required],
    aparatoTipo: ['', Validators.required],
    aparatoMarca: ['', Validators.required],
    aparatoModelo: ['', Validators.required],
    aparatoNumSerie: ['', Validators.required],
    observaciones: ['', Validators.required],
    costoReparacion: [0, [Validators.required, Validators.min(0)]]
  });

  recibosFiltrados = signal<Recibo[]>([]);
  pendientes = signal<Recibo[]>([]);
  reciboGenerado = signal<Recibo | null>(null);
  showModal = signal(false);
  showModalEntrega = signal(false);
  selectedPendiente = signal<Recibo | null>(null);
  reciboEntregado = signal<Recibo | null>(null);
  reciboEditando = signal<Recibo | null>(null);
  showModalEditar = signal(false);
  submittingEdicion = signal(false);
  reciboAEliminar = signal<Recibo | null>(null);
  showModalEliminar = signal(false);
  submittingEliminacion = signal(false);
  reciboPresupuesto = signal<Recibo | null>(null);
  presupuestoGuardado = signal<Recibo | null>(null);
  showModalPresupuesto = signal(false);
  submittingPresupuesto = signal(false);
  balance = signal<Balance>({ totalIngresados: 0, totalPendientes: 0, totalEntregados: 0, gananciasTotales: 0 });
  loading = signal(true);
  submitting = signal(false);
  errorMsg = signal<string | null>(null);

  ngOnInit() {
    this.cargarDatos();
  }

  async cargarDatos() {
    this.loading.set(true);
    await Promise.all([
      this.actualizarPendientes(),
      this.actualizarHistorial(),
      this.actualizarBalance()
    ]);
    this.loading.set(false);
  }

  async actualizarPendientes() {
    const result = await this.servicio.getPendientes();
    this.pendientes.set(result);
  }

  async actualizarHistorial() {
    const f = this.filtroHistorial.value;
    const result = await this.servicio.filtrarRecibos(f);
    this.recibosFiltrados.set(result);
  }

  async actualizarBalance() {
    const result = await this.servicio.getBalance();
    this.balance.set(result);
  }

  async aplicarFiltro() {
    await this.actualizarHistorial();
  }

  cambiarTab(tab: 'ingreso' | 'salida' | 'historial' | 'balance' | 'presupuesto') {
    this.tabActiva.set(tab);
    this.errorMsg.set(null);
    if (tab === 'salida' || tab === 'presupuesto') this.actualizarPendientes();
    if (tab === 'historial') this.actualizarHistorial();
    if (tab === 'balance') this.actualizarBalance();
  }

  async buscarReciboPresupuesto() {
    const id = this.formularioPresupuesto.get('buscarId')?.value;
    if (!id) return;
    const found = await this.servicio.buscarPorId(id);
    if (found && found.estado === 'Pendiente') {
      this.seleccionarParaPresupuesto(found);
    } else {
      this.reciboPresupuesto.set(null);
      this.errorMsg.set(found
        ? `El recibo ${id} ya fue entregado.`
        : `No se encontró ningún recibo con el ID ${id}.`);
    }
  }

  seleccionarParaPresupuesto(recibo: Recibo) {
    this.reciboPresupuesto.set(recibo);
    this.formularioPresupuesto.patchValue({
      buscarId: recibo.id,
      diagnostico: recibo.presupuesto?.diagnostico || '',
      costo: recibo.presupuesto?.costo ?? 0
    });
  }

  async guardarPresupuesto() {
    const recibo = this.reciboPresupuesto();
    if (!recibo || this.formularioPresupuesto.invalid) {
      this.formularioPresupuesto.markAllAsTouched();
      return;
    }

    this.errorMsg.set(null);
    this.submittingPresupuesto.set(true);

    try {
      const f = this.formularioPresupuesto.value;
      await this.servicio.editarRecibo(recibo.id, {
        presupuesto: {
          diagnostico: f.diagnostico,
          costo: f.costo,
          fecha: new Date().toISOString()
        }
      });

      const updated = await this.servicio.buscarPorId(recibo.id);
      this.presupuestoGuardado.set(updated || null);
      this.showModalPresupuesto.set(true);
      await this.actualizarPendientes();
      await this.actualizarHistorial();
    } catch (error: any) {
      this.errorMsg.set('Error al guardar presupuesto: ' + (error?.message || ''));
    } finally {
      this.submittingPresupuesto.set(false);
    }
  }

  cerrarModalPresupuesto() {
    this.showModalPresupuesto.set(false);
    this.presupuestoGuardado.set(null);
  }

  limpiarSeleccionPresupuesto() {
    this.reciboPresupuesto.set(null);
    this.formularioPresupuesto.reset({ buscarId: '', diagnostico: '', costo: 0 });
  }

  async buscarPendiente() {
    const id = this.formularioEntrega.get('buscarId')?.value;
    if (!id) return;
    const found = await this.servicio.buscarPorId(id);
    if (found && found.estado === 'Pendiente') {
      this.selectedPendiente.set(found);
      this.showModalEntrega.set(true);
    } else {
      this.selectedPendiente.set(null);
    }
  }

  async seleccionarPendiente(recibo: Recibo) {
    this.selectedPendiente.set(recibo);
    this.formularioEntrega.patchValue({ buscarId: recibo.id });
    this.showModalEntrega.set(true);
  }

  async confirmarEntrega() {
    const pendiente = this.selectedPendiente();
    if (!pendiente) return;

    const costo = this.formularioEntrega.get('costoReparacion')?.value || 0;
    const obs = this.formularioEntrega.get('observacionesFinales')?.value || '';

    await this.servicio.entregarEquipo(pendiente.id, costo, obs);
    const updated = await this.servicio.buscarPorId(pendiente.id);
    this.reciboEntregado.set(updated || null);

    this.showModalEntrega.set(false);
    this.formularioEntrega.reset({ buscarId: '', costoReparacion: 0, observacionesFinales: '' });
    this.selectedPendiente.set(null);
    await this.actualizarPendientes();
    await this.actualizarHistorial();
    await this.actualizarBalance();
  }

  cerrarModalEntrega() {
    this.showModalEntrega.set(false);
    this.selectedPendiente.set(null);
    this.reciboEntregado.set(null);
  }

  abrirEdicion(recibo: Recibo) {
    this.reciboEditando.set(recibo);
    this.formularioEdicion.patchValue({
      clienteNombre: recibo.cliente.nombre,
      clienteDireccion: recibo.cliente.direccion,
      clienteTelefono: recibo.cliente.telefono,
      aparatoTipo: recibo.aparato.tipo,
      aparatoMarca: recibo.aparato.marca,
      aparatoModelo: recibo.aparato.modelo,
      aparatoNumSerie: recibo.aparato.numSerie,
      observaciones: recibo.observaciones,
      costoReparacion: recibo.costoReparacion
    });
    this.showModalEditar.set(true);
  }

  async guardarEdicion() {
    const recibo = this.reciboEditando();
    if (!recibo || this.formularioEdicion.invalid) {
      this.formularioEdicion.markAllAsTouched();
      return;
    }

    this.submittingEdicion.set(true);

    try {
      const f = this.formularioEdicion.value;
      await this.servicio.editarRecibo(recibo.id, {
        cliente: {
          nombre: f.clienteNombre,
          direccion: f.clienteDireccion,
          telefono: f.clienteTelefono
        },
        aparato: {
          tipo: f.aparatoTipo,
          marca: f.aparatoMarca,
          modelo: f.aparatoModelo,
          numSerie: f.aparatoNumSerie
        },
        observaciones: f.observaciones,
        costoReparacion: f.costoReparacion
      });

      this.showModalEditar.set(false);
      this.reciboEditando.set(null);
      await this.actualizarPendientes();
      await this.actualizarHistorial();
      await this.actualizarBalance();
    } catch (error: any) {
      this.errorMsg.set('Error al guardar cambios: ' + (error?.message || ''));
    } finally {
      this.submittingEdicion.set(false);
    }
  }

  cerrarModalEditar() {
    this.showModalEditar.set(false);
    this.reciboEditando.set(null);
  }

  confirmarEliminacion(recibo: Recibo) {
    this.reciboAEliminar.set(recibo);
    this.showModalEliminar.set(true);
  }

  async ejecutarEliminacion() {
    const recibo = this.reciboAEliminar();
    if (!recibo) return;

    this.submittingEliminacion.set(true);

    try {
      await this.servicio.eliminarRecibo(recibo.id);
      this.showModalEliminar.set(false);
      this.reciboAEliminar.set(null);
      await this.actualizarPendientes();
      await this.actualizarHistorial();
      await this.actualizarBalance();
    } catch (error: any) {
      this.errorMsg.set('Error al eliminar: ' + (error?.message || ''));
    } finally {
      this.submittingEliminacion.set(false);
    }
  }

  cancelarEliminacion() {
    this.showModalEliminar.set(false);
    this.reciboAEliminar.set(null);
  }

  async generarRecibo() {
    if (this.formularioIngreso.invalid) {
      this.formularioIngreso.markAllAsTouched();
      return;
    }

    this.errorMsg.set(null);
    this.submitting.set(true);

    try {
      const f = this.formularioIngreso.value;
      const nuevo = await this.servicio.agregarRecibo({
        fecha: new Date(),
        cliente: {
          nombre: f.clienteNombre,
          direccion: f.clienteDireccion,
          telefono: f.clienteTelefono
        },
        aparato: {
          tipo: f.aparatoTipo,
          marca: f.aparatoMarca,
          modelo: f.aparatoModelo,
          numSerie: f.aparatoNumSerie
        },
        observaciones: f.observaciones
      });

      this.reciboGenerado.set(nuevo);
      this.showModal.set(true);
      this.formularioIngreso.reset();
      await this.actualizarPendientes();
      await this.actualizarHistorial();
      await this.actualizarBalance();
    } catch (error: any) {
      this.errorMsg.set('Error al guardar: ' + (error?.message || 'Verifica la conexion y la configuracion de Firestore'));
    } finally {
      this.submitting.set(false);
    }
  }

  cerrarModal() {
    this.showModal.set(false);
    this.reciboGenerado.set(null);
  }

  cerrarError() {
    this.errorMsg.set(null);
  }

  async descargarPDF() {
    const recibo = this.reciboGenerado();
    if (recibo) await this.generarPDF(recibo, 'ingreso');
  }

  async descargarPDFIngreso(recibo: Recibo) {
    await this.generarPDF(recibo, 'ingreso');
  }

  async descargarPDFEntregaRecibo(recibo: Recibo) {
    await this.generarPDF(recibo, 'entrega');
  }

  async descargarPDFPresupuesto(recibo: Recibo) {
    await this.generarPDF(recibo, 'presupuesto');
  }

  private async generarPDF(recibo: Recibo, tipo: 'ingreso' | 'entrega' | 'presupuesto') {
    this.pdfRecibo.set(recibo);
    this.pdfTipo.set(tipo);
    await new Promise(r => setTimeout(r, 100));
    const elemento = this.pdfPrint.nativeElement;
    const canvas = await html2canvas(elemento, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    const prefijo = tipo === 'entrega' ? 'Entrega' : tipo === 'presupuesto' ? 'Presupuesto' : 'Recibo';
    const fileName = `${prefijo}_${recibo.id}.pdf`;

    if (Capacitor.isNativePlatform()) {
      const base64 = pdf.output('datauristring').split(',')[1];
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Documents
      });
      await Share.share({ title: fileName, url: result.uri });
    } else {
      pdf.save(fileName);
    }
    this.pdfRecibo.set(null);
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency', currency: 'ARS'
    }).format(value);
  }
}