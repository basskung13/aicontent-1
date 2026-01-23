/**
 * Subscription Utility Functions
 * ระบบ Subscription รายเดือน
 */

// ราคาแพ็คเกจ
export const SUBSCRIPTION_PRICES = {
    PRO_PLAN: 199,           // แพลน Pro รายเดือน
    EXTRA_PROJECT: 250,      // เพิ่ม Project ละ 250 บาท/เดือน
};

// Limits พื้นฐานต่อ 1 Project
export const BASE_LIMITS = {
    PROJECTS: 1,
    MODES_PER_PROJECT: 2,
    EXTENDERS_PER_PROJECT: 2,
};

// Free Trial Limits
export const FREE_TRIAL_LIMITS = {
    PROJECTS: 1,
    MODES: 1,
    EXTENDERS: 1,
    DAYS: 7,
};

// Tier ระดับลูกค้า
export const SUBSCRIPTION_TIERS = {
    FREE: 'Free',
    VIP: 'VIP',           // Subscription ปกติ
    PREMIUM: 'Premium',   // Subscription + เพิ่ม Project
};

/**
 * คำนวณ Limits ตามจำนวน Projects ที่ซื้อ
 * @param {number} totalProjects - จำนวน Projects ทั้งหมด (1 = Pro Plan, 2+ = เพิ่ม Project)
 * @returns {{ projects: number, modes: number, extenders: number }}
 */
export const calculateLimits = (totalProjects = 1) => {
    const projects = Math.max(1, totalProjects);
    return {
        projects: projects,
        modes: projects * BASE_LIMITS.MODES_PER_PROJECT,
        extenders: projects * BASE_LIMITS.EXTENDERS_PER_PROJECT,
    };
};

/**
 * คำนวณราคา Prorate ตามวันที่เหลือในเดือน
 * @param {number} fullPrice - ราคาเต็มต่อเดือน
 * @param {Date} purchaseDate - วันที่ซื้อ
 * @returns {{ proratedPrice: number, daysRemaining: number, endOfMonth: Date }}
 */
export const calculateProrate = (fullPrice, purchaseDate = new Date()) => {
    const year = purchaseDate.getFullYear();
    const month = purchaseDate.getMonth();
    
    // วันสุดท้ายของเดือน
    const endOfMonth = new Date(year, month + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    
    // จำนวนวันในเดือน
    const daysInMonth = endOfMonth.getDate();
    
    // วันที่เหลือ (รวมวันนี้)
    const currentDay = purchaseDate.getDate();
    const daysRemaining = daysInMonth - currentDay + 1;
    
    // ราคา Prorate (ปัดขึ้นเป็นจำนวนเต็ม)
    const pricePerDay = fullPrice / daysInMonth;
    const proratedPrice = Math.ceil(pricePerDay * daysRemaining);
    
    return {
        proratedPrice,
        daysRemaining,
        daysInMonth,
        endOfMonth,
        pricePerDay: Math.round(pricePerDay * 100) / 100,
    };
};

/**
 * คำนวณราคารวมสำหรับการสมัคร/ต่ออายุ
 * @param {number} extraProjects - จำนวน Project เพิ่มเติม (0 = Pro Plan อย่างเดียว)
 * @param {boolean} isProrate - เป็นการซื้อระหว่างเดือนหรือไม่
 * @param {Date} purchaseDate - วันที่ซื้อ
 * @returns {{ total: number, breakdown: object }}
 */
export const calculateTotalPrice = (extraProjects = 0, isProrate = false, purchaseDate = new Date()) => {
    let proPlanPrice = SUBSCRIPTION_PRICES.PRO_PLAN;
    let extraProjectsPrice = extraProjects * SUBSCRIPTION_PRICES.EXTRA_PROJECT;
    
    let proPlanProrate = null;
    let extraProjectsProrate = null;
    
    if (isProrate) {
        proPlanProrate = calculateProrate(SUBSCRIPTION_PRICES.PRO_PLAN, purchaseDate);
        proPlanPrice = proPlanProrate.proratedPrice;
        
        if (extraProjects > 0) {
            extraProjectsProrate = calculateProrate(SUBSCRIPTION_PRICES.EXTRA_PROJECT * extraProjects, purchaseDate);
            extraProjectsPrice = extraProjectsProrate.proratedPrice;
        }
    }
    
    const total = proPlanPrice + extraProjectsPrice;
    const limits = calculateLimits(1 + extraProjects);
    
    return {
        total,
        breakdown: {
            proPlan: proPlanPrice,
            extraProjects: extraProjectsPrice,
            extraProjectsCount: extraProjects,
        },
        prorate: isProrate ? {
            proPlan: proPlanProrate,
            extraProjects: extraProjectsProrate,
        } : null,
        limits,
        tier: extraProjects > 0 ? SUBSCRIPTION_TIERS.PREMIUM : SUBSCRIPTION_TIERS.VIP,
    };
};

/**
 * คำนวณวันหมดอายุ (สิ้นเดือน)
 * @param {Date} fromDate - วันที่เริ่มต้น
 * @returns {Date}
 */
export const getExpiryDate = (fromDate = new Date()) => {
    const year = fromDate.getFullYear();
    const month = fromDate.getMonth();
    const endOfMonth = new Date(year, month + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    return endOfMonth;
};

/**
 * คำนวณวันที่ต้องแจ้งบิล (7 วันก่อนสิ้นเดือน)
 * @param {Date} expiryDate - วันหมดอายุ
 * @returns {Date}
 */
export const getBillingNotificationDate = (expiryDate) => {
    const notificationDate = new Date(expiryDate);
    notificationDate.setDate(notificationDate.getDate() - 7);
    return notificationDate;
};

/**
 * ตรวจสอบว่าควร Block การใช้งานหรือไม่
 * @param {Date} expiryDate - วันหมดอายุ
 * @param {string} status - สถานะ subscription
 * @returns {{ shouldBlock: boolean, reason: string, gracePeriodDays: number }}
 */
export const checkShouldBlock = (expiryDate, status) => {
    const now = new Date();
    const today = now.getDate();
    
    // ถ้า status เป็น active และยังไม่หมดอายุ ไม่ต้อง block
    if (status === 'active' && expiryDate > now) {
        return { shouldBlock: false, reason: null, gracePeriodDays: 0 };
    }
    
    // ถ้าหมดอายุแล้ว ตรวจสอบ grace period (วันที่ 1-3)
    if (status === 'expired' || expiryDate < now) {
        // Grace period: วันที่ 1-3 ของเดือน
        if (today >= 1 && today <= 3) {
            return {
                shouldBlock: false,
                reason: 'grace_period',
                gracePeriodDays: 4 - today, // เหลือกี่วันก่อน block
            };
        }
        
        // หลังวันที่ 3 = Block
        return {
            shouldBlock: true,
            reason: 'payment_overdue',
            gracePeriodDays: 0,
        };
    }
    
    return { shouldBlock: false, reason: null, gracePeriodDays: 0 };
};

/**
 * ตรวจสอบว่าอยู่ในช่วง Free Trial หรือไม่
 * @param {Date} trialEndsAt - วันที่ Trial หมด
 * @returns {{ isInTrial: boolean, daysRemaining: number }}
 */
export const checkFreeTrial = (trialEndsAt) => {
    if (!trialEndsAt) return { isInTrial: false, daysRemaining: 0 };
    
    const now = new Date();
    const trialEnd = new Date(trialEndsAt);
    
    if (now > trialEnd) {
        return { isInTrial: false, daysRemaining: 0 };
    }
    
    const diffTime = trialEnd - now;
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return { isInTrial: true, daysRemaining };
};

/**
 * สร้างข้อมูล Subscription เริ่มต้นสำหรับ User ใหม่ (Free Trial)
 * @param {string} userId 
 * @returns {object}
 */
export const createInitialSubscription = (userId) => {
    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + FREE_TRIAL_LIMITS.DAYS);
    
    return {
        userId,
        plan: 'free_trial',
        status: 'active',
        tier: SUBSCRIPTION_TIERS.FREE,
        extraProjects: 0,
        totalProjects: 1,
        limits: {
            projects: FREE_TRIAL_LIMITS.PROJECTS,
            modes: FREE_TRIAL_LIMITS.MODES,
            extenders: FREE_TRIAL_LIMITS.EXTENDERS,
        },
        startDate: now,
        expiryDate: trialEndsAt,
        trialEndsAt: trialEndsAt,
        isTrialUsed: true,
        createdAt: now,
        updatedAt: now,
    };
};

/**
 * สร้างข้อมูล Subscription หลังอนุมัติการชำระเงิน
 * @param {object} currentSub - Subscription ปัจจุบัน (ถ้ามี)
 * @param {number} extraProjects - จำนวน Project เพิ่มเติม
 * @param {Date} approvalDate - วันที่อนุมัติ
 * @returns {object}
 */
export const createApprovedSubscription = (currentSub, extraProjects = 0, approvalDate = new Date()) => {
    const now = approvalDate;
    const totalProjects = 1 + extraProjects;
    const limits = calculateLimits(totalProjects);
    
    // คำนวณวันหมดอายุ
    let expiryDate;
    
    // ถ้าจ่ายก่อนสิ้นเดือน ให้หมดอายุสิ้นเดือนถัดไป
    const endOfCurrentMonth = getExpiryDate(now);
    const dayOfMonth = now.getDate();
    
    if (dayOfMonth <= 25) {
        // จ่ายก่อนวันที่ 25 → หมดอายุสิ้นเดือนนี้
        expiryDate = endOfCurrentMonth;
    } else {
        // จ่ายหลังวันที่ 25 → หมดอายุสิ้นเดือนถัดไป
        expiryDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);
        expiryDate.setHours(23, 59, 59, 999);
    }
    
    return {
        plan: 'pro',
        status: 'active',
        tier: extraProjects > 0 ? SUBSCRIPTION_TIERS.PREMIUM : SUBSCRIPTION_TIERS.VIP,
        extraProjects,
        totalProjects,
        limits,
        startDate: now,
        expiryDate,
        trialEndsAt: currentSub?.trialEndsAt || null,
        isTrialUsed: true,
        updatedAt: now,
        lastPaymentAt: now,
    };
};

/**
 * Format ราคาเป็น Thai Baht
 * @param {number} amount 
 * @returns {string}
 */
export const formatPrice = (amount) => {
    return new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: 'THB',
        minimumFractionDigits: 0,
    }).format(amount);
};

/**
 * Format วันที่เป็นภาษาไทย
 * @param {Date} date 
 * @returns {string}
 */
export const formatThaiDate = (date) => {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};
