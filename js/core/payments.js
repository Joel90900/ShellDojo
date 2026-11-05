/**
 * SHELLDOJO - MOTOR DE PASARELA DE PAGOS COLOMBIA & LATAM (WOMPI / MERCADO PAGO / PSE / NEQUI)
 *
 * ¿CÓMO CONECTAR TUS PAGOS REALES EN PRODUCCIÓN?
 * 1. Crea tu cuenta en Wompi Bancolombia (comercios.wompi.co) o Mercado Pago Colombia (mercadopago.com.co).
 * 2. Crea tus Links de Pago para el Plan Pro Operator y Cyber Squad.
 * 3. En la URL de redirección exitosa de Wompi/MercadoPago coloca:
 *    https://tu-dominio.com/?payment=approved&plan=pro
 * 4. Cambia `mode: 'sandbox'` a `mode: 'live_redirect'` y pega tus URLs en `liveLinks`.
 */

export const PAYMENT_GATEWAY_CONFIG = {
  // 'sandbox' = Simulador bancario colombiano hiperrealista (Nequi, PSE, Daviplata, Tarjetas)
  // 'live_redirect' = Redirige directamente a tu Link de Pago real de Wompi o Mercado Pago
  mode: 'sandbox',
  providerName: 'Wompi Bancolombia & Mercado Pago Colombia',
  defaultCurrency: 'COP', // 'COP' | 'USD'
  exchangeRateCOP: 4000,
  ivaRate: 0.19, // 19% IVA Colombia

  liveLinks: {
    pro_monthly: '', // Ej: 'https://checkout.wompi.co/l/tu-link-pro-mensual'
    pro_yearly: '',  // Ej: 'https://checkout.wompi.co/l/tu-link-pro-anual'
    team_monthly: '',
    team_yearly: ''
  }
};

export const COLOMBIAN_BANKS_PSE = [
  'Bancolombia',
  'Nequi',
  'DaviPlata',
  'Banco Davivienda',
  'Banco de Bogotá',
  'BBVA Colombia',
  'Nu Colombia (Nubank)',
  'Lulo Bank',
  'Scotiabank Colpatria',
  'Banco Caja Social',
  'Banco Popular',
  'Banco de Occidente',
  'RappiPay',
  'Ualá Colombia'
];

export const DISCOUNT_COUPONS = {
  COLOMBIA50: { code: 'COLOMBIA50', discountPct: 50, label: '50% Beca Talento Colombia' },
  DOJO20: { code: 'DOJO20', discountPct: 20, label: '20% Descuento Comunidad' },
  SENA30: { code: 'SENA30', discountPct: 30, label: '30% Convenio Estudiantes' }
};

/**
 * Formatea valores monetarios en Pesos Colombianos (COP) o Dólares (USD).
 */
export function formatCurrency(amountCOP, currency = 'COP') {
  if (currency === 'USD') {
    const usd = Math.round((amountCOP / PAYMENT_GATEWAY_CONFIG.exchangeRateCOP) * 100) / 100;
    return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
  }
  return `$${Math.round(amountCOP).toLocaleString('es-CO')} COP`;
}

/**
 * Calcula el desglose exacto de una suscripción (Subtotal, Descuento Anual, Cupón, IVA 19% y Total).
 */
export function calculateCheckoutTotals({
  basePriceCOP,
  billingCycle = 'monthly', // 'monthly' | 'yearly'
  couponCode = ''
}) {
  let subtotal = Number(basePriceCOP) || 0;

  // Si es anual: 12 meses con 20% de descuento
  if (billingCycle === 'yearly') {
    subtotal = Math.round(subtotal * 12 * 0.8);
  }

  const normalizedCoupon = String(couponCode || '').trim().toUpperCase();
  const couponObj = DISCOUNT_COUPONS[normalizedCoupon] || null;
  const discountAmount = couponObj ? Math.round(subtotal * (couponObj.discountPct / 100)) : 0;

  const totalToPay = Math.max(0, subtotal - discountAmount);
  // Desglose informativo de base gravable + IVA 19% incluido
  const baseWithoutIva = Math.round(totalToPay / (1 + PAYMENT_GATEWAY_CONFIG.ivaRate));
  const ivaIncluded = totalToPay - baseWithoutIva;

  return {
    subtotal,
    discountAmount,
    couponApplied: couponObj,
    baseWithoutIva,
    ivaIncluded,
    totalToPay
  };
}

/**
 * Detecta la franquicia de la tarjeta (Visa, Mastercard, Amex) y aplica formato 0000 0000 0000 0000.
 */
export function detectCardBrand(cardNumber = '') {
  const digits = String(cardNumber).replace(/\D/g, '');
  if (/^4/.test(digits)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'MASTERCARD';
  if (/^3[47]/.test(digits)) return 'AMEX';
  return 'TARJETA';
}

export function formatCardNumberInput(value = '') {
  const digits = String(value).replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/**
 * Valida un número de celular colombiano (debe iniciar por 3 y tener 10 dígitos) para Nequi / Daviplata.
 */
export function validateColombianPhone(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  return /^3\d{9}$/.test(digits);
}

/**
 * Genera una referencia única de transacción estilo Wompi / PSE (CUS).
 */
export function generateTransactionReceipt({ planName, methodLabel, amountCOP, currency, buyerDoc }) {
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  const cusCode = Math.floor(100000000 + Math.random() * 900000000);
  const now = new Date();

  return {
    reference: `WOMPI-CO-${randomDigits}`,
    cus: String(cusCode),
    dateISO: now.toLocaleString('es-CO'),
    planName,
    methodLabel,
    formattedTotal: formatCurrency(amountCOP, currency),
    buyerDoc: buyerDoc || 'CC 1.020.xxx.xxx'
  };
}

