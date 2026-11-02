import { Injectable } from '@angular/core';
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, query, where, runTransaction, orderBy, limit } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/firebase';
import { Recibo, Balance } from '../models/recibo.model';

@Injectable({
  providedIn: 'root'
})
export class ReciboService {
  private app: FirebaseApp;
  private db: Firestore;
  private receiptsCollectionName = 'recibos';
  private counterDoc = 'contadores/recibos';

  constructor() {
    this.app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    this.db = getFirestore(this.app);
  }

  private async generarId(): Promise<string> {
    const counterRef = doc(this.db, this.counterDoc);

    let base = 0;
    if (!(await getDoc(counterRef)).exists()) {
      const q = query(collection(this.db, this.receiptsCollectionName), orderBy('id', 'desc'), limit(1));
      const ultimos = await getDocs(q);
      if (!ultimos.empty) {
        const match = /(\d+)/.exec(ultimos.docs[0].data()['id'] || '');
        if (match) base = parseInt(match[1], 10);
      }
    }

    const num = await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(counterRef);
      const siguiente = snap.exists() ? (snap.data()['ultimo'] || 0) + 1 : base + 1;
      tx.set(counterRef, { ultimo: siguiente });
      return siguiente;
    });
    return `N°${num.toString().padStart(5, '0')}`;
  }

  async agregarRecibo(recibo: Omit<Recibo, 'id' | 'estado' | 'costoReparacion'>): Promise<Recibo> {
    const nuevoId = await this.generarId();
    const nuevo: Recibo = {
      ...recibo,
      id: nuevoId,
      estado: 'Pendiente',
      costoReparacion: 0
    };

    const firestoreOp = addDoc(collection(this.db, this.receiptsCollectionName), {
      ...nuevo,
      fecha: nuevo.fecha.toISOString()
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firebase no respondio — revisa tu conexion o la configuracion de Firestore')), 15000)
    );

    await Promise.race([firestoreOp, timeout]);

    return nuevo;
  }

  async buscarPorId(id: string): Promise<Recibo | undefined> {
    const q = query(collection(this.db, this.receiptsCollectionName), where('id', '==', id));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) { return undefined; }

    return this.docToRecibo(querySnapshot.docs[0]);
  }

  async entregarEquipo(id: string, costo: number, observacionesFinales: string): Promise<boolean> {
    const q = query(collection(this.db, this.receiptsCollectionName), where('id', '==', id));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) { return false; }

    const docRef = doc(this.db, this.receiptsCollectionName, querySnapshot.docs[0].id);
    await updateDoc(docRef, {
      estado: 'Entregado',
      costoReparacion: costo,
      observaciones: observacionesFinales || ''
    });

    return true;
  }

  async editarRecibo(id: string, cambios: Partial<Recibo>): Promise<boolean> {
    const q = query(collection(this.db, this.receiptsCollectionName), where('id', '==', id));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) { return false; }

    const docRef = doc(this.db, this.receiptsCollectionName, querySnapshot.docs[0].id);
    await updateDoc(docRef, { ...cambios });

    return true;
  }

  async eliminarRecibo(id: string): Promise<boolean> {
    const q = query(collection(this.db, this.receiptsCollectionName), where('id', '==', id));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) { return false; }

    const docRef = doc(this.db, this.receiptsCollectionName, querySnapshot.docs[0].id);
    await deleteDoc(docRef);

    return true;
  }

  async filtrarRecibos(filtro: { cliente?: string | null; marca?: string | null; estado?: string | null }): Promise<Recibo[]> {
    const querySnapshot = await getDocs(collection(this.db, this.receiptsCollectionName));
    const todos = querySnapshot.docs.map(doc => this.docToRecibo(doc));

    return todos.filter(r => {
      const coincideCliente = !filtro.cliente || r.cliente.nombre.toLowerCase().includes(filtro.cliente.toLowerCase());
      const coincideMarca = !filtro.marca || r.aparato.marca.toLowerCase().includes(filtro.marca.toLowerCase());
      const coincideEstado = !filtro.estado || r.estado === filtro.estado;
      return coincideCliente && coincideMarca && coincideEstado;
    });
  }

  async getPendientes(): Promise<Recibo[]> {
    const q = query(collection(this.db, this.receiptsCollectionName), where('estado', '==', 'Pendiente'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.docToRecibo(doc));
  }

  async getAllRecibos(): Promise<Recibo[]> {
    const querySnapshot = await getDocs(collection(this.db, this.receiptsCollectionName));
    return querySnapshot.docs.map(doc => this.docToRecibo(doc));
  }

  async getBalance(): Promise<Balance> {
    const todos = await this.getAllRecibos();
    return {
      totalIngresados: todos.length,
      totalPendientes: todos.filter(r => r.estado === 'Pendiente').length,
      totalEntregados: todos.filter(r => r.estado === 'Entregado').length,
      gananciasTotales: todos.filter(r => r.estado === 'Entregado').reduce((sum, r) => sum + (r.costoReparacion || 0), 0)
    };
  }

  private docToRecibo(docSnap: { data: () => any } | any): Recibo {
    const data = docSnap.data ? docSnap.data() : docSnap;
    return {
      ...data,
      fecha: new Date(data.fecha)
    };
  }
}