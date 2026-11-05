/**
 * SHELLDOJO - PUNTO DE ENTRADA PRINCIPAL (SAAS EDITION + PASARELA COLOMBIA)
 * Gestiona:
 * - Portada de Inicio ("Qué vas a aprender")
 * - Autenticación (Login / Register / Demo Instantáneo / Logout)
 * - Pasarela de Pagos Colombiana (Wompi / Mercado Pago / Nequi / PSE / Daviplata / Tarjeta)
 * - Dashboard de Rutas, Modo Dojo, Panic Arena, Misiones Diarias y Diccionario
 */

import { CURRICULUM_DATA, SUBSCRIPTION_PLANS } from './data/curriculum.js';
import {
  getState,
  isAuthenticated,
  hasProAccess,
  loginUser,
  registerUser,
  logoutUser,
  upgradeSubscriptionPlan,
  toggleAudioMute,
  resetAllProgress,
  registerIssuedCertificate,
  calculateRank
} from './core/state.js';
import { SoundFX } from './core/audio.js';
import {
  buildCertificateData,
  sendCertificateViaGmail,
  downloadCertificatePrintable
} from './core/certificates.js';
import { fireCyberConfetti } from './core/confetti.js';
import {
  PAYMENT_GATEWAY_CONFIG,
  COLOMBIAN_BANKS_PSE,
  formatCurrency,
  calculateCheckoutTotals,
  detectCardBrand,
  formatCardNumberInput,
  validateColombianPhone,
  generateTransactionReceipt
} from './core/payments.js';
import { syncPaymentTransaction, syncAppStateWithBackend } from './core/sync.js';
import {
  updateHUD,
  switchView,
  renderAcademyTracks,
  renderDailyBounties,
  renderPricingPlans,
  renderCheatsheet,
  renderLeaderboard,
  renderCertificateVerifier,
  renderBossArena,
  renderDuelArena,
  renderOperatorPortfolio,
  printTechnicalCV,
  renderSettingsAndShop,
  renderStudyTools,
  renderFeedbackView
} from './ui/renderer.js';
import { initDojoController, loadDojoLesson } from './ui/dojoController.js';
import { initArenaController, startArenaSession, stopArenaTimer } from './ui/arenaController.js';

let pendingCheckoutPlanId = 'pro';
let selectedCurrency = PAYMENT_GATEWAY_CONFIG.defaultCurrency; // 'COP' | 'USD'
let selectedBillingCycle = 'monthly'; // 'monthly' | 'yearly'
let selectedPaymentMethod = 'nequi'; // 'nequi' | 'pse' | 'card' | 'daviplata'
let activeCouponCode = '';

document.addEventListener('DOMContentLoaded', () => {
  // 0. Poblar selector de bancos colombianos PSE
  const pseBankSelect = document.getElementById('pse-bank-select');
  if (pseBankSelect) {
    pseBankSelect.innerHTML = COLOMBIAN_BANKS_PSE.map(
      (bank) => `<option value="${bank}">${bank}</option>`
    ).join('');
  }

  // 1. Función maestra para refrescar todas las vistas dinámicas
  const refreshAllViews = () => {
    updateHUD();

    renderAcademyTracks({
      onSelectLesson: (trackId, lessonId) => {
        stopArenaTimer();
        loadDojoLesson(trackId, lessonId);
        switchView('dojo');
      },
      onStartExam: (trackId) => {
        switchView('arena');
        startArenaSession(trackId);
      },
      onOpenPricing: () => {
        stopArenaTimer();
        refreshPricingView();
        switchView('pricing');
      },
      onClaimCertificate: (achievementTitle) => {
        openCertificateModal(achievementTitle);
      }
    });

    renderDailyBounties({
      onOpenPricing: () => {
        stopArenaTimer();
        refreshPricingView();
        switchView('pricing');
      },
      onClaimCertificate: (achievementTitle) => {
        openCertificateModal(achievementTitle);
      }
    });

    renderBossArena({
      onBossDefeated: () => {
        fireCyberConfetti(4500);
        updateHUD();
        renderLeaderboard();
      },
      onClaimCertificate: (achievementTitle) => {
        openCertificateModal(achievementTitle);
      }
    });

    renderDuelArena({
      onClaimCertificate: (achievementTitle) => {
        openCertificateModal(achievementTitle);
      }
    });

    renderOperatorPortfolio({
      onClaimCertificate: (achievementTitle) => {
        openCertificateModal(achievementTitle);
      }
    });

    renderSettingsAndShop({
      onOpenPricing: () => {
        stopArenaTimer();
        refreshPricingView();
        switchView('pricing');
      }
    });

    renderLeaderboard();
    renderCertificateVerifier();
    renderFeedbackView();
    renderCheatsheet(document.getElementById('cheatsheet-search-input')?.value || '', 'all');
    renderStudyTools();
    refreshPricingView();
  };

  function refreshPricingView() {
    renderPricingPlans({
      currency: selectedCurrency,
      billingCycle: selectedBillingCycle,
      onChoosePlan: handlePlanSelection
    });
  }

  // 2. Controles de Moneda (COP / USD) y Ciclo (Mensual / Anual)
  const btnCop = document.getElementById('btn-currency-cop');
  const btnUsd = document.getElementById('btn-currency-usd');
  const btnMonthly = document.getElementById('btn-cycle-monthly');
  const btnYearly = document.getElementById('btn-cycle-yearly');

  if (btnCop && btnUsd) {
    btnCop.addEventListener('click', () => {
      selectedCurrency = 'COP';
      btnCop.className = 'px-3 py-1.5 rounded font-bold bg-neonGreen text-black transition-all';
      btnUsd.className = 'px-3 py-1.5 rounded font-bold text-slate-400 hover:text-white transition-all';
      refreshPricingView();
    });

    btnUsd.addEventListener('click', () => {
      selectedCurrency = 'USD';
      btnUsd.className = 'px-3 py-1.5 rounded font-bold bg-neonGreen text-black transition-all';
      btnCop.className = 'px-3 py-1.5 rounded font-bold text-slate-400 hover:text-white transition-all';
      refreshPricingView();
    });
  }

  if (btnMonthly && btnYearly) {
    btnMonthly.addEventListener('click', () => {
      selectedBillingCycle = 'monthly';
      btnMonthly.className = 'px-3 py-1.5 rounded font-bold bg-neonCyan text-black transition-all';
      btnYearly.className =
        'px-3 py-1.5 rounded font-bold text-slate-400 hover:text-white transition-all flex items-center gap-1.5';
      refreshPricingView();
    });

    btnYearly.addEventListener('click', () => {
      selectedBillingCycle = 'yearly';
      btnYearly.className =
        'px-3 py-1.5 rounded font-bold bg-neonCyan text-black transition-all flex items-center gap-1.5';
      btnMonthly.className = 'px-3 py-1.5 rounded font-bold text-slate-400 hover:text-white transition-all';
      refreshPricingView();
    });
  }

  // 3. Manejo de Selección de Plan y Pasarela Colombiana (Wompi / Mercado Pago)
  function handlePlanSelection(planId) {
    if (!isAuthenticated()) {
      openAuthScreen('register', planId);
      return;
    }

    if (planId === 'free') {
      upgradeSubscriptionPlan('free');
      refreshAllViews();
      switchView('academy');
      return;
    }

    // Si el usuario configuró links reales de Wompi / Mercado Pago en `PAYMENT_GATEWAY_CONFIG`
    const linkKey = `${planId}_${selectedBillingCycle}`;
    const realUrl = PAYMENT_GATEWAY_CONFIG.liveLinks[linkKey];
    if (PAYMENT_GATEWAY_CONFIG.mode === 'live_redirect' && realUrl) {
      window.location.href = realUrl;
      return;
    }

    // Abrir modal interactivo de Pasarela Colombiana
    pendingCheckoutPlanId = planId;
    activeCouponCode = '';

    const couponInput = document.getElementById('checkout-coupon-input');
    const couponFeedback = document.getElementById('checkout-coupon-feedback');
    const errorMsg = document.getElementById('checkout-error-msg');
    if (couponInput) couponInput.value = '';
    if (couponFeedback) {
      couponFeedback.className = 'text-[11px] text-slate-400';
      couponFeedback.textContent = 'Ingresa tu código si tienes uno.';
    }
    if (errorMsg) errorMsg.classList.add('hidden');

    // Mostrar el paso 1 (Formulario) y ocultar Procesamiento y Recibo
    document.getElementById('checkout-step-form')?.classList.remove('hidden');
    document.getElementById('checkout-step-processing')?.classList.add('hidden');
    document.getElementById('checkout-step-receipt')?.classList.add('hidden');

    updateCheckoutModalSummary();
    document.getElementById('checkout-modal')?.classList.remove('hidden');
  }

  function updateCheckoutModalSummary() {
    const planObj = SUBSCRIPTION_PLANS.find((p) => p.id === pendingCheckoutPlanId) || SUBSCRIPTION_PLANS[1];
    const cycleLabel = selectedBillingCycle === 'yearly' ? 'Anual (-20%)' : 'Mensual';

    const titleEl = document.getElementById('checkout-plan-title');
    if (titleEl) {
      titleEl.textContent = `Suscripción ${planObj.name} — Plan ${cycleLabel}`;
    }

    const totals = calculateCheckoutTotals({
      basePriceCOP: planObj.priceMonthlyCOP,
      billingCycle: selectedBillingCycle,
      couponCode: activeCouponCode
    });

    const baseEl = document.getElementById('summary-base');
    const ivaEl = document.getElementById('summary-iva');
    const discountRow = document.getElementById('summary-discount-row');
    const discountEl = document.getElementById('summary-discount');
    const totalEl = document.getElementById('checkout-plan-price');

    if (baseEl) baseEl.textContent = formatCurrency(totals.baseWithoutIva, selectedCurrency);
    if (ivaEl) ivaEl.textContent = formatCurrency(totals.ivaIncluded, selectedCurrency);

    if (discountRow && discountEl) {
      if (totals.discountAmount > 0) {
        discountRow.classList.remove('hidden');
        discountRow.classList.add('flex');
        discountEl.textContent = `-${formatCurrency(totals.discountAmount, selectedCurrency)}`;
      } else {
        discountRow.classList.add('hidden');
        discountRow.classList.remove('flex');
      }
    }

    if (totalEl) {
      totalEl.textContent = formatCurrency(totals.totalToPay, selectedCurrency);
    }

    return totals;
  }

  // Selector de método de pago (Nequi, PSE, Tarjeta, DaviPlata)
  const methodButtons = document.querySelectorAll('[data-pay-method]');
  methodButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedPaymentMethod = btn.getAttribute('data-pay-method');
      methodButtons.forEach((b) => {
        const active = b.getAttribute('data-pay-method') === selectedPaymentMethod;
        b.className = active
          ? 'pay-method-tab active-pay-method p-2.5 rounded-lg border border-neonGreen bg-neonGreen/15 text-neonGreen flex flex-col items-center gap-1 transition-all'
          : 'pay-method-tab p-2.5 rounded-lg border border-crtBorder bg-black text-slate-300 hover:text-white flex flex-col items-center gap-1 transition-all';
      });

      ['nequi', 'pse', 'card', 'daviplata'].forEach((m) => {
        const panel = document.getElementById(`method-fields-${m}`);
        if (panel) panel.classList.toggle('hidden', m !== selectedPaymentMethod);
      });
    });
  });

  // Botón de Aplicar Cupón (COLOMBIA50, SENA30, DOJO20)
  document.getElementById('btn-apply-coupon')?.addEventListener('click', () => {
    const input = document.getElementById('checkout-coupon-input');
    const feedback = document.getElementById('checkout-coupon-feedback');
    if (!input) return;

    activeCouponCode = input.value.trim().toUpperCase();
    const totals = updateCheckoutModalSummary();

    if (totals.couponApplied) {
      SoundFX.playSuccess();
      if (feedback) {
        feedback.className = 'text-[11px] text-neonGreen font-bold';
        feedback.textContent = `✔ Cupón aplicado: ${totals.couponApplied.label}`;
      }
    } else {
      SoundFX.playError();
      activeCouponCode = '';
      updateCheckoutModalSummary();
      if (feedback) {
        feedback.className = 'text-[11px] text-neonRed';
        feedback.textContent = '✖ Cupón no válido.';
      }
    }
  });

  // Formateo en vivo de tarjeta y detección de marca (Visa / Mastercard / Amex)
  const cardInput = document.getElementById('card-number-input');
  const brandBadge = document.getElementById('card-brand-badge');
  if (cardInput) {
    cardInput.addEventListener('input', (e) => {
      const formatted = formatCardNumberInput(e.target.value);
      e.target.value = formatted;
      if (brandBadge) {
        brandBadge.textContent = detectCardBrand(formatted);
      }
    });
  }

  // Cerrar modal de Checkout
  const closeCheckoutBtn = document.getElementById('btn-close-checkout');
  const checkoutModal = document.getElementById('checkout-modal');
  if (closeCheckoutBtn && checkoutModal) {
    closeCheckoutBtn.addEventListener('click', () => {
      checkoutModal.classList.add('hidden');
    });
  }

  // Procesar Pago con Simulación Bancaria Colombiana y Generar Comprobante CUS / Wompi
  const checkoutForm = document.getElementById('form-checkout');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const errorMsg = document.getElementById('checkout-error-msg');
      if (errorMsg) errorMsg.classList.add('hidden');

      // Validar celular colombiano si eligió Nequi o DaviPlata
      if (selectedPaymentMethod === 'nequi') {
        const phone = document.getElementById('nequi-phone')?.value;
        if (!validateColombianPhone(phone)) {
          SoundFX.playError();
          if (errorMsg) {
            errorMsg.textContent = '✖ Ingresa un número celular Nequi válido en Colombia (10 dígitos iniciando por 3).';
            errorMsg.classList.remove('hidden');
          }
          return;
        }
      } else if (selectedPaymentMethod === 'daviplata') {
        const phone = document.getElementById('daviplata-phone')?.value;
        if (!validateColombianPhone(phone)) {
          SoundFX.playError();
          if (errorMsg) {
            errorMsg.textContent = '✖ Ingresa un celular DaviPlata válido en Colombia (10 dígitos iniciando por 3).';
            errorMsg.classList.remove('hidden');
          }
          return;
        }
      }

      // Mostrar pantalla de procesamiento bancario
      const stepForm = document.getElementById('checkout-step-form');
      const stepProc = document.getElementById('checkout-step-processing');
      const stepReceipt = document.getElementById('checkout-step-receipt');
      const procTitle = document.getElementById('processing-title');
      const procSub = document.getElementById('processing-subtitle');

      stepForm?.classList.add('hidden');
      stepProc?.classList.remove('hidden');

      const methodLabels = {
        nequi: `Nequi Push (${document.getElementById('nequi-phone')?.value})`,
        pse: `Débito Bancario PSE (${document.getElementById('pse-bank-select')?.value})`,
        card: `Tarjeta ${detectCardBrand(document.getElementById('card-number-input')?.value)}`,
        daviplata: `Billetera DaviPlata (${document.getElementById('daviplata-phone')?.value})`
      };

      if (procTitle) {
        procTitle.textContent =
          selectedPaymentMethod === 'nequi'
            ? 'Enviando notificación Push a tu Nequi...'
            : selectedPaymentMethod === 'pse'
            ? `Conectando con ${document.getElementById('pse-bank-select')?.value} vía ACH PSE...`
            : 'Autorizando transacción segura con el banco emisor...';
      }
      if (procSub) {
        procSub.textContent = 'Verificando firma digital y confirmación de pago...';
      }

      setTimeout(() => {
        SoundFX.playLevelUp();
        upgradeSubscriptionPlan(pendingCheckoutPlanId);

        const planObj = SUBSCRIPTION_PLANS.find((p) => p.id === pendingCheckoutPlanId) || SUBSCRIPTION_PLANS[1];
        const totals = updateCheckoutModalSummary();
        const docType = document.getElementById('pay-doc-type')?.value || 'CC';
        const docNum = document.getElementById('pay-doc-number')?.value || 'No especificado';

        const receipt = generateTransactionReceipt({
          planName: planObj.name,
          methodLabel: methodLabels[selectedPaymentMethod],
          amountCOP: totals.totalToPay,
          currency: selectedCurrency,
          buyerDoc: `${docType} ${docNum}`
        });

        const activeUser = getState().user;
        syncPaymentTransaction({
          reference: receipt.reference,
          cus: receipt.cus,
          planName: planObj.name,
          planId: pendingCheckoutPlanId,
          methodLabel: receipt.methodLabel,
          amountCOP: totals.totalToPay,
          currency: selectedCurrency,
          buyerDoc: receipt.buyerDoc,
          buyerEmail: activeUser?.email || ''
        });

        document.getElementById('receipt-ref').textContent = receipt.reference;
        document.getElementById('receipt-cus').textContent = receipt.cus;
        document.getElementById('receipt-method').textContent = receipt.methodLabel;
        document.getElementById('receipt-doc').textContent = receipt.buyerDoc;
        document.getElementById('receipt-date').textContent = receipt.dateISO;
        document.getElementById('receipt-total').textContent = receipt.formattedTotal;

        const secState = getState().proAccountSecurity || {};
        const licEl = document.getElementById('receipt-license-token');
        if (licEl) licEl.textContent = secState.licenseToken || 'SDJ-LIC-PRO-VERIFIED';

        stepProc?.classList.add('hidden');
        stepReceipt?.classList.remove('hidden');
        refreshAllViews();
      }, 1500);
    });
  }

  document.getElementById('btn-finish-receipt')?.addEventListener('click', () => {
    checkoutModal?.classList.add('hidden');
    refreshAllViews();
    switchView('academy');
  });

  // Detector automático de redirección exitosa desde Wompi o Mercado Pago (?payment=approved&plan=pro)
  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get('payment');
  const paidPlan = urlParams.get('plan');
  if ((paymentStatus === 'approved' || paymentStatus === 'success') && (paidPlan === 'pro' || paidPlan === 'team')) {
    upgradeSubscriptionPlan(paidPlan);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // 4. Configuración de Login y Registro
  const tabLogin = document.getElementById('tab-auth-login');
  const tabRegister = document.getElementById('tab-auth-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const authErrorBox = document.getElementById('auth-error-box');
  const regPlanSelect = document.getElementById('reg-plan');

  function openAuthScreen(mode = 'login', preselectPlan = 'free') {
    stopArenaTimer();
    if (authErrorBox) authErrorBox.classList.add('hidden');

    const isLogin = mode === 'login';
    if (formLogin) formLogin.classList.toggle('hidden', !isLogin);
    if (formRegister) formRegister.classList.toggle('hidden', isLogin);

    if (tabLogin) {
      tabLogin.className = isLogin
        ? 'py-3.5 text-center border-b-2 border-neonGreen text-neonGreen bg-neonGreen/10'
        : 'py-3.5 text-center border-b-2 border-transparent text-slate-400 hover:text-white';
    }
    if (tabRegister) {
      tabRegister.className = !isLogin
        ? 'py-3.5 text-center border-b-2 border-neonGreen text-neonGreen bg-neonGreen/10'
        : 'py-3.5 text-center border-b-2 border-transparent text-slate-400 hover:text-white';
    }

    if (regPlanSelect && preselectPlan) {
      regPlanSelect.value = preselectPlan;
    }

    switchView('auth');
  }

  if (tabLogin) tabLogin.addEventListener('click', () => openAuthScreen('login'));
  if (tabRegister) tabRegister.addEventListener('click', () => openAuthScreen('register'));

  if (formLogin) {
    formLogin.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email')?.value;
      const password = document.getElementById('login-password')?.value;

      const res = loginUser({ email, password });
      if (!res.ok) {
        SoundFX.playError();
        if (authErrorBox) {
          authErrorBox.textContent = res.error;
          authErrorBox.classList.remove('hidden');
        }
        return;
      }

      SoundFX.playSuccess();
      refreshAllViews();
      switchView('academy');
    });
  }

  if (formRegister) {
    formRegister.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name')?.value;
      const handle = document.getElementById('reg-handle')?.value;
      const docType = document.getElementById('reg-doc-type')?.value || 'CC';
      const docNumber = document.getElementById('reg-doc-number')?.value || '';
      const email = document.getElementById('reg-email')?.value;
      const phone = document.getElementById('reg-phone')?.value || '';
      const institution = document.getElementById('reg-institution')?.value || 'Independiente';
      const occupation = document.getElementById('reg-occupation')?.value || 'Ingeniería de Sistemas & DevOps';
      const country = document.getElementById('reg-country')?.value || 'Colombia';
      const password = document.getElementById('reg-password')?.value;
      const selectedPlan = document.getElementById('reg-plan')?.value || 'free';

      const res = registerUser({
        name,
        handle,
        docType,
        docNumber,
        email,
        phone,
        institution,
        occupation,
        country,
        password,
        selectedPlan
      });
      if (!res.ok) {
        SoundFX.playError();
        if (authErrorBox) {
          authErrorBox.textContent = res.error;
          authErrorBox.classList.remove('hidden');
        }
        return;
      }

      SoundFX.playLevelUp();
      refreshAllViews();
      switchView('academy');
    });
  }

  document.getElementById('btn-hero-start')?.addEventListener('click', () => openAuthScreen('register'));

  document.querySelectorAll('[data-public-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-public-nav');
      if (target === 'login') openAuthScreen('login');
      else if (target === 'register') openAuthScreen('register');
      else if (target === 'pricing') {
        refreshPricingView();
        switchView('pricing');
      } else if (target === 'verify') {
        renderCertificateVerifier();
        switchView('verify');
      } else if (target === 'leaderboard') {
        renderLeaderboard();
        switchView('leaderboard');
      } else if (target === 'feedback') {
        renderFeedbackView();
        switchView('feedback');
      } else {
        switchView('landing');
      }
    });
  });

  // Formulario del Verificador Público de Certificados (#view-verify)
  const verifyForm = document.getElementById('form-verify-certificate');
  if (verifyForm) {
    verifyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = document.getElementById('verify-code-input')?.value || '';
      SoundFX.playKey();
      renderCertificateVerifier(code);
    });
  }

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    stopArenaTimer();
    logoutUser();
    updateHUD();
    switchView('landing');
  });

  // 5. Inicializar Controlador del Modo Dojo
  initDojoController({
    onBackToAcademy: () => {
      refreshAllViews();
      switchView('academy');
    },
    onStartTrackExam: (trackId) => {
      switchView('arena');
      startArenaSession(trackId);
    },
    onProgressUpdated: () => {
      refreshAllViews();
    },
    onClaimCertificate: (achievementTitle) => {
      openCertificateModal(achievementTitle);
    }
  });

  loadDojoLesson(CURRICULUM_DATA[0].id, CURRICULUM_DATA[0].lessons[0].id);

  // 6. Inicializar Controlador del Modo Arena
  initArenaController({
    onBackToAcademy: () => {
      refreshAllViews();
      switchView('academy');
    },
    onArenaCompleted: () => {
      refreshAllViews();
    },
    onClaimCertificate: (achievementTitle) => {
      openCertificateModal(achievementTitle);
    }
  });

  // 6.5. Modal de Certificado Oficial ShellDojo (Gmail & PDF HD)
  let currentCertData = null;
  const certModal = document.getElementById('certificate-modal');
  const certInputName = document.getElementById('cert-input-name');
  const certInputDoc = document.getElementById('cert-input-doc');
  const certInputInstitution = document.getElementById('cert-input-institution');
  const certInputEmail = document.getElementById('cert-input-email');
  const certFeedback = document.getElementById('cert-status-feedback');

  function openCertificateModal(achievementTitle) {
    const state = getState();
    currentCertData = buildCertificateData({
      achievementTitle,
      customRecipientName: state.user?.name,
      customEmail: state.user?.email
    });

    if (certInputName) certInputName.value = currentCertData.recipientName;
    if (certInputDoc) certInputDoc.value = currentCertData.recipientDoc;
    if (certInputInstitution) certInputInstitution.value = currentCertData.institution;
    if (certInputEmail) certInputEmail.value = currentCertData.recipientEmail;
    if (certFeedback) certFeedback.classList.add('hidden');

    syncCertPreview();
    fireCyberConfetti(4000);
    certModal?.classList.remove('hidden');
  }

  function syncCertPreview() {
    if (!currentCertData) return;
    currentCertData.recipientName = certInputName?.value.trim() || currentCertData.recipientName;
    currentCertData.recipientDoc = certInputDoc?.value.trim() || currentCertData.recipientDoc;
    currentCertData.institution = certInputInstitution?.value.trim() || currentCertData.institution;
    currentCertData.recipientEmail = certInputEmail?.value.trim() || currentCertData.recipientEmail;

    registerIssuedCertificate({ ...currentCertData });

    document.getElementById('cert-modal-id').textContent = currentCertData.certificateId;
    document.getElementById('cert-preview-name').textContent = currentCertData.recipientName;
    const identityEl = document.getElementById('cert-preview-identity');
    if (identityEl) {
      identityEl.textContent = `ID: ${currentCertData.recipientDoc} • ${currentCertData.institution} • ${currentCertData.occupation} (${currentCertData.country})`;
    }
    document.getElementById('cert-preview-course').textContent = `"${currentCertData.achievementTitle}"`;
    document.getElementById('cert-preview-code').textContent = currentCertData.certificateId;
    document.getElementById('cert-preview-rank').textContent = `${currentCertData.rankTitle} (${currentCertData.xpTotal} XP)`;
    document.getElementById('cert-preview-date').textContent = currentCertData.dateFormatted;
  }

  certInputName?.addEventListener('input', syncCertPreview);
  certInputDoc?.addEventListener('input', syncCertPreview);
  certInputInstitution?.addEventListener('input', syncCertPreview);
  certInputEmail?.addEventListener('input', syncCertPreview);

  document.getElementById('btn-close-certificate')?.addEventListener('click', () => {
    certModal?.classList.add('hidden');
  });

  document.getElementById('btn-cert-send-gmail')?.addEventListener('click', () => {
    syncCertPreview();
    SoundFX.playSuccess();
    sendCertificateViaGmail(currentCertData);
    if (certFeedback) certFeedback.classList.remove('hidden');
  });

  document.getElementById('btn-cert-download-pdf')?.addEventListener('click', () => {
    syncCertPreview();
    SoundFX.playSuccess();
    downloadCertificatePrintable(currentCertData);
  });

  document.getElementById('btn-cert-share-linkedin')?.addEventListener('click', () => {
    syncCertPreview();
    SoundFX.playSuccess();
    fireCyberConfetti(3500);
    const cert = currentCertData;
    if (!cert) return;
    const certName = encodeURIComponent(cert.achievementTitle || 'Certificación Oficial Linux & DevOps');
    const certOrg = encodeURIComponent('ShellDojo Terminal Academy');
    const certId = encodeURIComponent(cert.certificateId || '');
    const certUrl = encodeURIComponent(`http://localhost:3000/?verify=${cert.certificateId}`);
    const now = new Date();
    const issueYear = now.getFullYear();
    const issueMonth = now.getMonth() + 1;

    const linkedinUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${certName}&organizationName=${certOrg}&issueYear=${issueYear}&issueMonth=${issueMonth}&certUrl=${certUrl}&certId=${certId}`;

    window.open(linkedinUrl, '_blank');
  });

  // 7. Inicializar Cheatsheet / Diccionario en tiempo real
  renderCheatsheet('', 'all');

  const searchInput = document.getElementById('cheatsheet-search-input');
  const categoryButtons = document.querySelectorAll('#cheatsheet-category-filters [data-cat]');
  let selectedCat = 'all';

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderCheatsheet(e.target.value, selectedCat);
    });
  }

  categoryButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedCat = btn.getAttribute('data-cat');
      categoryButtons.forEach((b) => {
        const isCurrent = b.getAttribute('data-cat') === selectedCat;
        b.className = isCurrent
          ? 'cat-filter active-cat px-3 py-1 rounded text-xs font-bold border border-neonGreen bg-neonGreen/10 text-neonGreen'
          : 'cat-filter px-3 py-1 rounded text-xs font-bold border border-crtBorder bg-black text-slate-400 hover:text-white';
      });
      renderCheatsheet(searchInput ? searchInput.value : '', selectedCat);
    });
  });

  // 8. Enrutador de Pestañas del Dashboard
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-nav');
      if (targetView !== 'arena') {
        stopArenaTimer();
      }
      if (
        targetView === 'academy' ||
        targetView === 'bounties' ||
        targetView === 'pricing' ||
        targetView === 'boss' ||
        targetView === 'leaderboard' ||
        targetView === 'verify' ||
        targetView === 'duel' ||
        targetView === 'portfolio' ||
        targetView === 'settings' ||
        targetView === 'feedback'
      ) {
        refreshAllViews();
      }
      if (targetView === 'arena') {
        startArenaSession('global');
      }
      switchView(targetView);
    });
  });

  // Botón de perfil/avatar en el HUD superior lleva a Configuración & Tienda XP
  document.getElementById('btn-hud-profile')?.addEventListener('click', () => {
    stopArenaTimer();
    refreshAllViews();
    switchView('settings');
  });

  // Botones del Portafolio / CV Técnico (PDF Imprimible y Resumen LinkedIn)
  document.getElementById('btn-portfolio-print-cv')?.addEventListener('click', () => {
    SoundFX.playSuccess();
    printTechnicalCV();
  });

  document.getElementById('btn-portfolio-linkedin')?.addEventListener('click', () => {
    const state = getState();
    const u = state.user || { name: 'Operador ShellDojo', institution: 'Colombia', occupation: 'Ingeniero DevOps' };
    const certCode = state.issuedCertificates?.[0]?.certificateId || 'Sin certificado emitido aún';
    const summaryText = [
      `🚀 ${u.name} — ${u.occupation} (${u.institution})`,
      `🏆 Rango Oficial ShellDojo: ${calculateRank(state.xp)} (${state.xp} XP) | Niveles Superados: ${state.completedLessons.length}/42 (630 ejercicios prácticos CLI)`,
      `💻 Tecnologías Dominadas en Terminal: Git & GitHub, Linux SysAdmin, Docker & Compose, Redes Windows, SQL, Python/Node & Ciberseguridad SecOps.`,
      `🎓 Credencial Verificable ID: ${certCode} (Verificación pública en ShellDojo Terminal Academy)`
    ].join('\n');

    navigator.clipboard?.writeText(summaryText);
    SoundFX.playSuccess();
    const banner = document.getElementById('portfolio-feedback-banner');
    if (banner) {
      banner.classList.remove('hidden');
      setTimeout(() => banner.classList.add('hidden'), 4500);
    }
  });

  document.getElementById('brand-logo')?.addEventListener('click', () => {
    stopArenaTimer();
    refreshAllViews();
    switchView(isAuthenticated() ? 'academy' : 'landing');
  });

  document.getElementById('btn-global-survival')?.addEventListener('click', () => {
    switchView('arena');
    startArenaSession('global');
  });

  document.getElementById('btn-dashboard-settings')?.addEventListener('click', () => {
    stopArenaTimer();
    refreshAllViews();
    switchView('settings');
  });

  document.getElementById('btn-dashboard-portfolio')?.addEventListener('click', () => {
    stopArenaTimer();
    refreshAllViews();
    switchView('portfolio');
  });

  document.getElementById('dashboard-avatar-box')?.addEventListener('click', () => {
    stopArenaTimer();
    refreshAllViews();
    switchView('settings');
  });

  document.getElementById('btn-go-upgrade')?.addEventListener('click', () => {
    refreshPricingView();
    switchView('pricing');
  });

  document.getElementById('btn-bounties-upgrade')?.addEventListener('click', () => {
    refreshPricingView();
    switchView('pricing');
  });

  document.getElementById('btn-footer-feedback')?.addEventListener('click', () => {
    stopArenaTimer();
    renderFeedbackView();
    switchView('feedback');
  });

  // 6.7. Botón Flotante de Soporte Rápido y Asistencia
  const supportBubble = document.getElementById('btn-toggle-support-bubble');
  const supportCard = document.getElementById('quick-support-card');
  const closeSupportBtn = document.getElementById('btn-close-support-card');
  const quickOpenFeedbackBtn = document.getElementById('btn-quick-open-feedback');

  supportBubble?.addEventListener('click', () => {
    SoundFX.playKey();
    supportCard?.classList.toggle('hidden');
  });

  closeSupportBtn?.addEventListener('click', () => {
    supportCard?.classList.add('hidden');
  });

  quickOpenFeedbackBtn?.addEventListener('click', () => {
    supportCard?.classList.add('hidden');
    stopArenaTimer();
    renderFeedbackView();
    switchView('feedback');
  });

  document.getElementById('btn-audio-toggle')?.addEventListener('click', () => {
    toggleAudioMute();
    updateHUD();
  });

  document.getElementById('btn-reset-progress')?.addEventListener('click', () => {
    if (window.confirm('¿Deseas reiniciar tu XP, rango y lecciones completadas a cero?')) {
      stopArenaTimer();
      resetAllProgress();
      refreshAllViews();
    }
  });

  refreshAllViews();

  // Sincronización automática bidireccional en tiempo real con la base de datos (store.json)
  syncAppStateWithBackend().then(() => refreshAllViews());
  window.addEventListener('focus', () => {
    syncAppStateWithBackend().then(() => refreshAllViews());
  });

  // Si la URL incluye ?verify=SDJ-2026-XXXX o ?duel=XXXX, navegar directamente a esa vista
  const verifyParam = urlParams.get('verify');
  const duelParam = urlParams.get('duel');
  if (verifyParam) {
    renderCertificateVerifier(verifyParam);
    switchView('verify');
  } else if (duelParam) {
    renderDuelArena();
    switchView('duel');
  } else {
    switchView(isAuthenticated() ? 'academy' : 'landing');
  }

  // Atajo discreto para el Administrador: combinación oculta Ctrl+Alt+A
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'a') {
      window.location.href = '/admin';
    }
  });
});
