/**
 * useSubscription Hook
 * จัดการ Subscription state และ Firebase operations
 */

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
    createInitialSubscription,
    checkShouldBlock,
    checkFreeTrial,
    calculateLimits,
    SUBSCRIPTION_TIERS,
    FREE_TRIAL_LIMITS,
} from '../utils/subscriptionUtils';

export const useSubscription = (userId) => {
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Listen to subscription changes
    useEffect(() => {
        if (!userId) {
            setSubscription(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        const subRef = doc(db, 'users', userId, 'subscription', 'main');
        
        const unsubscribe = onSnapshot(
            subRef,
            async (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    // Convert Firestore timestamps to Date
                    const subData = {
                        ...data,
                        startDate: data.startDate?.toDate?.() || data.startDate,
                        expiryDate: data.expiryDate?.toDate?.() || data.expiryDate,
                        trialEndsAt: data.trialEndsAt?.toDate?.() || data.trialEndsAt,
                        createdAt: data.createdAt?.toDate?.() || data.createdAt,
                        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
                        lastPaymentAt: data.lastPaymentAt?.toDate?.() || data.lastPaymentAt,
                    };
                    setSubscription(subData);
                } else {
                    // สร้าง Free Trial สำหรับ User ใหม่
                    try {
                        const initialSub = createInitialSubscription(userId);
                        await setDoc(subRef, {
                            ...initialSub,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        });
                        setSubscription(initialSub);
                    } catch (err) {
                        console.error('Error creating initial subscription:', err);
                        setError(err.message);
                    }
                }
                setLoading(false);
            },
            (err) => {
                console.error('Subscription listener error:', err);
                setError(err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [userId]);

    // ตรวจสอบสถานะ
    const getStatus = useCallback(() => {
        if (!subscription) {
            return {
                isActive: false,
                isBlocked: true,
                isInTrial: false,
                tier: SUBSCRIPTION_TIERS.FREE,
                limits: FREE_TRIAL_LIMITS,
                daysRemaining: 0,
                blockReason: 'no_subscription',
            };
        }

        const { isInTrial, daysRemaining: trialDaysRemaining } = checkFreeTrial(subscription.trialEndsAt);
        
        // ถ้าอยู่ใน Free Trial
        if (subscription.plan === 'free_trial' && isInTrial) {
            return {
                isActive: true,
                isBlocked: false,
                isInTrial: true,
                tier: SUBSCRIPTION_TIERS.FREE,
                limits: subscription.limits || FREE_TRIAL_LIMITS,
                daysRemaining: trialDaysRemaining,
                blockReason: null,
            };
        }

        // ตรวจสอบว่าควร Block หรือไม่
        const blockCheck = checkShouldBlock(subscription.expiryDate, subscription.status);
        
        // คำนวณวันที่เหลือ
        let daysRemaining = 0;
        if (subscription.expiryDate) {
            const now = new Date();
            const expiry = new Date(subscription.expiryDate);
            if (expiry > now) {
                daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
            }
        }

        return {
            isActive: subscription.status === 'active' && !blockCheck.shouldBlock,
            isBlocked: blockCheck.shouldBlock,
            isInTrial: false,
            tier: subscription.tier || SUBSCRIPTION_TIERS.VIP,
            limits: subscription.limits || calculateLimits(subscription.totalProjects || 1),
            daysRemaining,
            gracePeriodDays: blockCheck.gracePeriodDays,
            blockReason: blockCheck.reason,
        };
    }, [subscription]);

    // ตรวจสอบว่าสามารถสร้าง Project/Mode/Extender ได้หรือไม่
    const canCreate = useCallback((type, currentCount) => {
        const status = getStatus();
        
        if (status.isBlocked) {
            return {
                allowed: false,
                reason: status.blockReason === 'payment_overdue' 
                    ? 'กรุณาชำระค่าบริการเพื่อใช้งานต่อ'
                    : 'Subscription หมดอายุ',
                remaining: 0,
            };
        }

        const limits = status.limits;
        let limit = 0;
        
        switch (type) {
            case 'project':
                limit = limits.projects;
                break;
            case 'mode':
                limit = limits.modes;
                break;
            case 'extender':
                limit = limits.extenders;
                break;
            default:
                return { allowed: false, reason: 'Unknown type', remaining: 0 };
        }

        const remaining = limit - currentCount;
        
        if (currentCount >= limit) {
            return {
                allowed: false,
                reason: `คุณใช้งานครบ ${limit} ${type} แล้ว กรุณาอัพเกรดเพื่อเพิ่มเติม`,
                remaining: 0,
                limit,
            };
        }

        return {
            allowed: true,
            reason: null,
            remaining,
            limit,
        };
    }, [getStatus]);

    // ตรวจสอบว่าต้องแจ้งบิลหรือไม่ (7 วันก่อนหมดอายุ)
    const shouldShowBillingNotice = useCallback(() => {
        if (!subscription || subscription.plan === 'free_trial') return false;
        
        const now = new Date();
        const expiry = new Date(subscription.expiryDate);
        const daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        
        return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
    }, [subscription]);

    return {
        subscription,
        loading,
        error,
        getStatus,
        canCreate,
        shouldShowBillingNotice,
        // Expose raw data for components
        isLoaded: !loading && subscription !== null,
    };
};

export default useSubscription;
