import { Component, inject, signal, ViewChild, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ReciboService } from '../../services/recibo.service';
import { Recibo, Balance } from '../../models/recibo.model';
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

  @ViewChild('reciboPrint') reciboPrint!: ElementRef;

  tabActiva = signal<'ingreso' | 'salida' | 'historial' | 'balance'>('ingreso');

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

  filtroHistorial = this.fb.group({
    cliente: [''],
    marca: [''],
    estado: ['']
  });

  recibosFiltrados = signal<Recibo[]>([]);
  pendientes = signal<Recibo[]>([]);
  reciboGenerado = signal<Recibo | null>(null);
  showModal = signal(false);
  showModalEntrega = signal(false);
  selectedPendiente = signal<Recibo | null>(null);
  reciboEntregado = signal<Recibo | null>(null);
  balance = signal<Balance>({ totalIngresados: 0, totalPendientes: 0, totalEntregados: 0, gananciasTotales: 0 });
  loading = signal(true);
  submitting = signal(false);

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

  cambiarTab(tab: 'ingreso' | 'salida' | 'historial' | 'balance') {
    this.tabActiva.set(tab);
    if (tab === 'salida') this.actualizarPendientes();
    if (tab === 'historial') this.actualizarHistorial();
    if (tab === 'balance') this.actualizarBalance();
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

  async generarRecibo() {
    if (this.formularioIngreso.invalid) {
      this.formularioIngreso.markAllAsTouched();
      return;
    }

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
    } catch (error) {
      console.error('Error generando recibo:', error);
    } finally {
      this.submitting.set(false);
    }
  }

  cerrarModal() {
    this.showModal.set(false);
    this.reciboGenerado.set(null);
  }

  async descargarPDF() {
    const elemento = this.reciboPrint.nativeElement;
    const canvas = await html2canvas(elemento, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    const recibo = this.reciboGenerado();
    pdf.save(`Recibo_${recibo?.id || 'electronica'}.pdf`);
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