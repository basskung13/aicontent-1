import React, { useState, useEffect, useMemo } from 'react';
import { db, auth, functions } from '../firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, updateDoc, setDoc, increment, getDoc, getDocs, runTransaction } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';
import { CheckCircle, XCircle, ExternalLink, Clock, Loader2, TrendingUp, TrendingDown, Users, Wallet, CreditCard, ArrowUpRight, ArrowDownRight, Edit3, DollarSign, BarChart3, Building2, Database, Trash2, RefreshCw, HardDrive, Crown, Star } from 'lucide-react';
import GlassDropdown from '../components/ui/GlassDropdown';
import { createApprovedSubscription, formatPrice, formatThaiDate, SUBSCRIPTION_TIERS } from '../utils/subscriptionUtils';

const Admin = () => {
    const [currentUser, setCurrentUser] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [creditSubTab, setCreditSubTab] = useState('deposits'); // deposits, withdrawals, subscriptions, manager

    // Payments
    const [paymentRequests, setPaymentRequests] = useState([]);
    const [paymentLogs, setPaymentLogs] = useState([]);
    const [withdrawalRequests, setWithdrawalRequests] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [loadingPayments, setLoadingPayments] = useState(false);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [processingPaymentId, setProcessingPaymentId] = useState(null);
    const [processingWithdrawalId, setProcessingWithdrawalId] = useState(null);

    // Subscription Payments
    const [subscriptionPayments, setSubscriptionPayments] = useState([]);
    const [loadingSubPayments, setLoadingSubPayments] = useState(false);
    const [processingSubPaymentId, setProcessingSubPaymentId] = useState(null);

    // Credit Manager
    const [selectedUser, setSelectedUser] = useState(null);
    const [creditAdjustAmount, setCreditAdjustAmount] = useState('');
    const [creditAdjustReason, setCreditAdjustReason] = useState('');
    const [adjustingCredit, setAdjustingCredit] = useState(false);
    const [showCreditModal, setShowCreditModal] = useState(false);
    const [adminCreditLogs, setAdminCreditLogs] = useState([]);
    const [loadingCreditLogs, setLoadingCreditLogs] = useState(false);

    // Activity Filters
    const [activitySearch, setActivitySearch] = useState('');
    const [activityTypeFilter, setActivityTypeFilter] = useState('all');
    const [activityApproverFilter, setActivityApproverFilter] = useState('all');

    // Storage Dashboard
    const [storageStats, setStorageStats] = useState(null);
    const [loadingStorage, setLoadingStorage] = useState(false);
    const [cleaningUp, setCleaningUp] = useState(false);
    const [selectedProjectForStorage, setSelectedProjectForStorage] = useState('');
    const [userProjects, setUserProjects] = useState([]);

    // Helper: แสดง Admin แทน email
    const formatApprover = (email) => {
        if (!email) return 'ระบบ';
        if (email.toLowerCase().includes('fxfarm.dashboard')) return 'Admin';
        return email.split('@')[0];
    };

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
        });
        return () => unsubscribeAuth();
    }, []);

    // Fetch Payment Requests
    useEffect(() => {
        if (!currentUser) return undefined;
        setLoadingPayments(true);
        const q = query(collection(db, 'payment_requests'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPaymentRequests(data);
            setLoadingPayments(false);
        }, () => setLoadingPayments(false));
        return () => unsubscribe();
    }, [currentUser]);

    // Fetch Payment Logs
    useEffect(() => {
        if (!currentUser) return undefined;
        setLoadingLogs(true);
        const q = query(collection(db, 'payment_logs'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPaymentLogs(data);
            setLoadingLogs(false);
        }, () => setLoadingLogs(false));
        return () => unsubscribe();
    }, [currentUser]);

    // Fetch Withdrawal Requests
    useEffect(() => {
        if (!currentUser) return undefined;
        setLoadingWithdrawals(true);
        const q = query(collection(db, 'withdrawal_requests'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setWithdrawalRequests(data);
            setLoadingWithdrawals(false);
        }, () => setLoadingWithdrawals(false));
        return () => unsubscribe();
    }, [currentUser]);

    // Fetch Subscription Payments
    useEffect(() => {
        if (!currentUser) return undefined;
        setLoadingSubPayments(true);
        const q = query(collection(db, 'subscription_payments'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSubscriptionPayments(data);
            setLoadingSubPayments(false);
        }, () => setLoadingSubPayments(false));
        return () => unsubscribe();
    }, [currentUser]);

    // Fetch All Users with Wallet
    useEffect(() => {
        if (!currentUser) return;
        setLoadingUsers(true);
        const fetchUsers = async () => {
            try {
                const usersSnap = await getDocs(collection(db, 'users'));
                const usersData = await Promise.all(usersSnap.docs.map(async (userDoc) => {
                    const userData = { id: userDoc.id, ...userDoc.data() };
                    try {
                        const walletDoc = await getDoc(doc(db, 'users', userDoc.id, 'wallet', 'main'));
                        userData.walletBalance = walletDoc.exists() ? (walletDoc.data().balance || 0) : 0;
                    } catch {
                        userData.walletBalance = 0;
                    }
                    return userData;
                }));
                setAllUsers(usersData);
            } catch (error) {
                console.error('Fetch users failed:', error);
            } finally {
                setLoadingUsers(false);
            }
        };
        fetchUsers();
    }, [currentUser]);

    // Fetch Admin Credit Logs
    useEffect(() => {
        if (!currentUser) return undefined;
        setLoadingCreditLogs(true);
        const q = query(collection(db, 'admin_credit_logs'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setAdminCreditLogs(data);
            setLoadingCreditLogs(false);
        }, () => setLoadingCreditLogs(false));
        return () => unsubscribe();
    }, [currentUser]);

    // Dashboard Statistics
    const stats = useMemo(() => {
        const approvedDeposits = paymentLogs.filter(l => l.status === 'approved' && l.type !== 'withdrawal');
        const approvedWithdrawals = withdrawalRequests.filter(w => w.status === 'approved');
        const totalDeposits = approvedDeposits.reduce((sum, l) => sum + Math.abs(l.amount || 0), 0);
        const totalWithdrawals = approvedWithdrawals.reduce((sum, w) => sum + Math.abs(w.amount || 0), 0);
        const pendingDeposits = paymentRequests.filter(r => r.status === 'pending').length;
        const pendingWithdrawals = withdrawalRequests.filter(w => w.status === 'pending').length;
        const totalUsers = allUsers.length;
        const totalBalance = allUsers.reduce((sum, u) => sum + (u.walletBalance || 0), 0);

        return { totalDeposits, totalWithdrawals, pendingDeposits, pendingWithdrawals, totalUsers, totalBalance };
    }, [paymentLogs, withdrawalRequests, paymentRequests, allUsers]);

    // Filtered Activities
    const filteredActivities = useMemo(() => {
        let activities = [...paymentLogs];
        
        // Filter by search text
        if (activitySearch.trim()) {
            const search = activitySearch.toLowerCase();
            activities = activities.filter(l => 
                l.userEmail?.toLowerCase().includes(search) ||
                l.reviewedByEmail?.toLowerCase().includes(search)
            );
        }
        
        // Filter by type
        if (activityTypeFilter === 'deposit') {
            activities = activities.filter(l => l.type !== 'withdrawal');
        } else if (activityTypeFilter === 'withdrawal') {
            activities = activities.filter(l => l.type === 'withdrawal');
        }
        
        // Filter by approver
        if (activityApproverFilter === 'admin') {
            activities = activities.filter(l => l.reviewedByEmail?.toLowerCase().includes('fxfarm.dashboard'));
        } else if (activityApproverFilter === 'other') {
            activities = activities.filter(l => !l.reviewedByEmail?.toLowerCase().includes('fxfarm.dashboard'));
        }
        
        return activities.slice(0, 20);
    }, [paymentLogs, activitySearch, activityTypeFilter, activityApproverFilter]);

    const handleApprovePayment = async (request) => {
        if (!currentUser) return;
        if (!confirm(`ยืนยันอนุมัติยอด ${request.amount} TOKEN ให้ ${request.userEmail}?`)) return;
        setProcessingPaymentId(request.id);

        try {
            // ป้องกันอนุมัติซ้ำ: ตรวจสอบสถานะปัจจุบันก่อน
            const currentDoc = await getDoc(doc(db, 'payment_requests', request.id));
            if (currentDoc.data()?.status !== 'pending') {
                alert('⚠️ รายการนี้ถูกดำเนินการไปแล้ว');
                setProcessingPaymentId(null);
                return;
            }

            await updateDoc(doc(db, 'payment_requests', request.id), {
                status: 'approved',
                reviewedAt: serverTimestamp(),
                reviewedById: currentUser.uid,
                reviewedByEmail: currentUser.email || ''
            });

            await setDoc(doc(db, 'users', request.userId, 'wallet', 'main'), {
                balance: increment(request.amount),
                updatedAt: serverTimestamp()
            }, { merge: true });

            await addDoc(collection(db, 'payment_logs'), {
                requestId: request.id,
                userId: request.userId,
                userEmail: request.userEmail || '',
                amount: request.amount,
                slipUrl: request.slipUrl || '',
                status: 'approved',
                reviewedById: currentUser.uid,
                reviewedByEmail: currentUser.email || '',
                note: '',
                createdAt: serverTimestamp()
            });
        } catch (error) {
            console.error('Approve payment failed:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            setProcessingPaymentId(null);
        }
    };

    const handleRejectPayment = async (request) => {
        if (!currentUser) return;
        const reason = prompt('กรุณาระบุเหตุผลที่ไม่อนุญาต (ถ้ามี)') || '';
        if (!confirm(`ยืนยันไม่อนุญาตยอด ${request.amount} TOKEN?`)) return;
        setProcessingPaymentId(request.id);

        try {
            const currentDoc = await getDoc(doc(db, 'payment_requests', request.id));
            if (currentDoc.data()?.status !== 'pending') {
                alert('⚠️ รายการนี้ถูกดำเนินการไปแล้ว');
                setProcessingPaymentId(null);
                return;
            }

            await updateDoc(doc(db, 'payment_requests', request.id), {
                status: 'rejected',
                reviewedAt: serverTimestamp(),
                reviewedById: currentUser.uid,
                reviewedByEmail: currentUser.email || '',
                rejectReason: reason
            });

            await addDoc(collection(db, 'payment_logs'), {
                requestId: request.id,
                userId: request.userId,
                userEmail: request.userEmail || '',
                amount: request.amount,
                slipUrl: request.slipUrl || '',
                status: 'rejected',
                reviewedById: currentUser.uid,
                reviewedByEmail: currentUser.email || '',
                note: reason,
                createdAt: serverTimestamp()
            });
        } catch (error) {
            console.error('Reject payment failed:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            setProcessingPaymentId(null);
        }
    };

    // Withdrawal Handlers
    const handleApproveWithdrawal = async (request) => {
        if (!currentUser) return;
        if (!confirm(`ยืนยันอนุมัติถอน ${request.amount} TOKEN ให้ ${request.userEmail}?\nบัญชี: ${request.bankName} ${request.accountNumber}`)) return;
        setProcessingWithdrawalId(request.id);

        try {
            const currentDoc = await getDoc(doc(db, 'withdrawal_requests', request.id));
            if (currentDoc.data()?.status !== 'pending') {
                alert('⚠️ รายการนี้ถูกดำเนินการไปแล้ว');
                setProcessingWithdrawalId(null);
                return;
            }

            // ตรวจสอบยอดเครดิตก่อนถอน
            const walletDoc = await getDoc(doc(db, 'users', request.userId, 'wallet', 'main'));
            const currentBalance = walletDoc.exists() ? (walletDoc.data().balance || 0) : 0;
            if (currentBalance < request.amount) {
                alert(`⚠️ ยอดเครดิตไม่เพียงพอ (มี ${currentBalance} ต้องการ ${request.amount})`);
                setProcessingWithdrawalId(null);
                return;
            }

            await updateDoc(doc(db, 'withdrawal_requests', request.id), {
                status: 'approved',
                reviewedAt: serverTimestamp(),
                reviewedById: currentUser.uid,
                reviewedByEmail: currentUser.email || ''
            });

            await setDoc(doc(db, 'users', request.userId, 'wallet', 'main'), {
                balance: increment(-request.amount),
                updatedAt: serverTimestamp()
            }, { merge: true });

            await addDoc(collection(db, 'payment_logs'), {
                type: 'withdrawal',
                requestId: request.id,
                userId: request.userId,
                userEmail: request.userEmail || '',
                amount: -request.amount,
                bankName: request.bankName,
                accountNumber: request.accountNumber,
                accountName: request.accountName,
                status: 'approved',
                reviewedById: currentUser.uid,
                reviewedByEmail: currentUser.email || '',
                createdAt: serverTimestamp()
            });

            alert('✅ อนุมัติถอนเงินสำเร็จ');
        } catch (error) {
            console.error('Approve withdrawal failed:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            setProcessingWithdrawalId(null);
        }
    };

    const handleRejectWithdrawal = async (request) => {
        if (!currentUser) return;
        const reason = prompt('กรุณาระบุเหตุผลที่ไม่อนุมัติ (ถ้ามี)') || '';
        if (!confirm(`ยืนยันไม่อนุมัติถอน ${request.amount} TOKEN?`)) return;
        setProcessingWithdrawalId(request.id);

        try {
            const currentDoc = await getDoc(doc(db, 'withdrawal_requests', request.id));
            if (currentDoc.data()?.status !== 'pending') {
                alert('⚠️ รายการนี้ถูกดำเนินการไปแล้ว');
                setProcessingWithdrawalId(null);
                return;
            }

            await updateDoc(doc(db, 'withdrawal_requests', request.id), {
                status: 'rejected',
                reviewedAt: serverTimestamp(),
                reviewedById: currentUser.uid,
                reviewedByEmail: currentUser.email || '',
                rejectReason: reason
            });

            await addDoc(collection(db, 'payment_logs'), {
                type: 'withdrawal',
                requestId: request.id,
                userId: request.userId,
                userEmail: request.userEmail || '',
                amount: request.amount,
                status: 'rejected',
                reviewedById: currentUser.uid,
                reviewedByEmail: currentUser.email || '',
                note: reason,
                createdAt: serverTimestamp()
            });
        } catch (error) {
            console.error('Reject withdrawal failed:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            setProcessingWithdrawalId(null);
        }
    };

    // Subscription Payment Handlers
    const handleApproveSubscription = async (payment) => {
        if (!currentUser) return;
        const tierText = payment.extraProjects > 0 ? `Premium (${payment.totalProjects} Projects)` : 'VIP (Pro Plan)';
        if (!confirm(`ยืนยันอนุมัติ Subscription ${tierText}\nยอด ${formatPrice(payment.amount)} ให้ ${payment.userEmail}?`)) return;
        setProcessingSubPaymentId(payment.id);

        try {
            const currentDoc = await getDoc(doc(db, 'subscription_payments', payment.id));
            if (currentDoc.data()?.status !== 'pending') {
                alert('⚠️ รายการนี้ถูกดำเนินการไปแล้ว');
                setProcessingSubPaymentId(null);
                return;
            }

            // อัปเดต subscription_payments
            await updateDoc(doc(db, 'subscription_payments', payment.id), {
                status: 'approved',
                reviewedAt: serverTimestamp(),
                reviewedById: currentUser.uid,
                reviewedByEmail: currentUser.email || ''
            });

            // ดึง subscription ปัจจุบัน
            const subRef = doc(db, 'users', payment.userId, 'subscription', 'main');
            const subDoc = await getDoc(subRef);
            const currentSub = subDoc.exists() ? subDoc.data() : null;

            // สร้าง subscription ใหม่
            const newSub = createApprovedSubscription(currentSub, payment.extraProjects || 0);
            await setDoc(subRef, {
                ...newSub,
                updatedAt: serverTimestamp(),
                lastPaymentAt: serverTimestamp(),
                lastPaymentId: payment.id,
            }, { merge: true });

            // บันทึก log
            await addDoc(collection(db, 'payment_logs'), {
                type: 'subscription',
                requestId: payment.id,
                userId: payment.userId,
                userEmail: payment.userEmail || '',
                amount: payment.amount,
                slipUrl: payment.slipUrl || '',
                tier: payment.tier,
                extraProjects: payment.extraProjects || 0,
                totalProjects: payment.totalProjects || 1,
                limits: payment.limits,
                status: 'approved',
                reviewedById: currentUser.uid,
                reviewedByEmail: currentUser.email || '',
                createdAt: serverTimestamp()
            });

            alert(`✅ อนุมัติ Subscription สำเร็จ\nTier: ${payment.tier}\nLimits: ${payment.limits?.projects} Projects, ${payment.limits?.modes} Modes, ${payment.limits?.extenders} Extenders`);
        } catch (error) {
            console.error('Approve subscription failed:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            setProcessingSubPaymentId(null);
        }
    };

    const handleRejectSubscription = async (payment) => {
        if (!currentUser) return;
        const reason = prompt('กรุณาระบุเหตุผลที่ไม่อนุมัติ (ถ้ามี)') || '';
        if (!confirm(`ยืนยันไม่อนุมัติ Subscription ยอด ${formatPrice(payment.amount)}?`)) return;
        setProcessingSubPaymentId(payment.id);

        try {
            const currentDoc = await getDoc(doc(db, 'subscription_payments', payment.id));
            if (currentDoc.data()?.status !== 'pending') {
                alert('⚠️ รายการนี้ถูกดำเนินการไปแล้ว');
                setProcessingSubPaymentId(null);
                return;
            }

            await updateDoc(doc(db, 'subscription_payments', payment.id), {
                status: 'rejected',
                reviewedAt: serverTimestamp(),
                reviewedById: currentUser.uid,
                reviewedByEmail: currentUser.email || '',
                rejectReason: reason
            });

            await addDoc(collection(db, 'payment_logs'), {
                type: 'subscription',
                requestId: payment.id,
                userId: payment.userId,
                userEmail: payment.userEmail || '',
                amount: payment.amount,
                status: 'rejected',
                reviewedById: currentUser.uid,
                reviewedByEmail: currentUser.email || '',
                note: reason,
                createdAt: serverTimestamp()
            });
        } catch (error) {
            console.error('Reject subscription failed:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            setProcessingSubPaymentId(null);
        }
    };

    // Credit Adjustment Handler
    const handleAdjustCredit = async () => {
        if (!currentUser || !selectedUser) return;
        const amount = parseInt(creditAdjustAmount);
        if (isNaN(amount) || amount === 0) {
            alert('กรุณากรอกจำนวนเครดิตที่ถูกต้อง');
            return;
        }
        if (!creditAdjustReason.trim()) {
            alert('กรุณาระบุเหตุผลการปรับเครดิต');
            return;
        }

        const action = amount > 0 ? 'เพิ่ม' : 'ลด';
        if (!confirm(`ยืนยัน${action}เครดิต ${Math.abs(amount)} TOKEN ให้ ${selectedUser.email}?`)) return;

        setAdjustingCredit(true);
        try {
            // ตรวจสอบยอดก่อนลด
            if (amount < 0) {
                const walletDoc = await getDoc(doc(db, 'users', selectedUser.id, 'wallet', 'main'));
                const currentBalance = walletDoc.exists() ? (walletDoc.data().balance || 0) : 0;
                if (currentBalance + amount < 0) {
                    alert(`⚠️ ไม่สามารถลดได้ (มี ${currentBalance} ต้องการลด ${Math.abs(amount)})`);
                    setAdjustingCredit(false);
                    return;
                }
            }

            await setDoc(doc(db, 'users', selectedUser.id, 'wallet', 'main'), {
                balance: increment(amount),
                updatedAt: serverTimestamp()
            }, { merge: true });

            await addDoc(collection(db, 'admin_credit_logs'), {
                userId: selectedUser.id,
                userEmail: selectedUser.email || '',
                amount: amount,
                reason: creditAdjustReason,
                adminId: currentUser.uid,
                adminEmail: currentUser.email || '',
                createdAt: serverTimestamp()
            });

            // Update local state
            setAllUsers(prev => prev.map(u => 
                u.id === selectedUser.id 
                    ? { ...u, walletBalance: (u.walletBalance || 0) + amount }
                    : u
            ));

            alert(`✅ ${action}เครดิต ${Math.abs(amount)} TOKEN สำเร็จ`);
            setShowCreditModal(false);
            setCreditAdjustAmount('');
            setCreditAdjustReason('');
            setSelectedUser(null);
        } catch (error) {
            console.error('Adjust credit failed:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            setAdjustingCredit(false);
        }
    };

    // Calculate user stats
    const getUserStats = (userId) => {
        const deposits = paymentLogs.filter(l => l.userId === userId && l.status === 'approved' && (l.type !== 'withdrawal'));
        const withdrawals = paymentLogs.filter(l => l.userId === userId && l.status === 'approved' && l.type === 'withdrawal');
        const totalDeposit = deposits.reduce((sum, l) => sum + Math.abs(l.amount || 0), 0);
        const totalWithdraw = withdrawals.reduce((sum, l) => sum + Math.abs(l.amount || 0), 0);
        return { totalDeposit, totalWithdraw, depositCount: deposits.length, withdrawCount: withdrawals.length };
    };

    // Fetch ALL user projects for storage dashboard (Admin sees all)
    useEffect(() => {
        if (!currentUser) return;
        const fetchAllProjects = async () => {
            try {
                const allProjects = [];
                const usersSnap = await getDocs(collection(db, 'users'));
                for (const userDoc of usersSnap.docs) {
                    const userEmail = userDoc.data().email || userDoc.id;
                    const projectsSnap = await getDocs(collection(db, 'users', userDoc.id, 'projects'));
                    projectsSnap.docs.forEach(d => {
                        allProjects.push({
                            id: d.id,
                            userId: userDoc.id,
                            name: d.data().name || d.id,
                            userEmail: userEmail,
                            label: `${d.data().name || d.id} (${userEmail.split('@')[0]})`
                        });
                    });
                }
                // เพิ่มตัวเลือก "ทุกโปรเจค" ที่หัวลิสต์
                const allOption = { id: 'all', userId: 'all', name: '📊 ทุกโปรเจค', label: '📊 ทุกโปรเจค (ล้างทั้งหมด)', isAll: true };
                setUserProjects([allOption, ...allProjects]);
                if (!selectedProjectForStorage) {
                    setSelectedProjectForStorage(JSON.stringify({ userId: 'all', projectId: 'all' }));
                }
            } catch (err) {
                console.error('Fetch all projects error:', err);
            }
        };
        fetchAllProjects();
    }, [currentUser]);

    // Fetch storage stats
    const fetchStorageStats = async () => {
        if (!selectedProjectForStorage) return;
        setLoadingStorage(true);
        try {
            const parsed = JSON.parse(selectedProjectForStorage);
            const getStorageStats = httpsCallable(functions, 'getStorageStats');
            // ส่ง allProjects ถ้าเลือก "ทุกโปรเจค"
            if (parsed.projectId === 'all') {
                const projectsList = userProjects.filter(p => !p.isAll).map(p => ({ userId: p.userId, projectId: p.id }));
                const result = await getStorageStats({ allProjects: projectsList });
                setStorageStats(result.data);
            } else {
                const result = await getStorageStats({ projectId: parsed.projectId, userId: parsed.userId });
                setStorageStats(result.data);
            }
        } catch (err) {
            console.error('Get storage stats error:', err);
            alert('เกิดข้อผิดพลาด: ' + err.message);
        } finally {
            setLoadingStorage(false);
        }
    };

    // Manual cleanup handler
    const handleManualCleanup = async (targets = ['all']) => {
        if (!selectedProjectForStorage) return;
        const parsed = JSON.parse(selectedProjectForStorage);
        const isAllProjects = parsed.projectId === 'all';
        const confirmMsg = isAllProjects 
            ? `⚠️ ยืนยันการล้างข้อมูลเก่า (> 7 วัน) สำหรับ ทุกโปรเจค (${userProjects.length - 1} โปรเจค)?`
            : `ยืนยันการล้างข้อมูลเก่า (> 7 วัน) สำหรับ ${targets.join(', ')}?`;
        if (!confirm(confirmMsg)) return;
        
        setCleaningUp(true);
        try {
            const manualCleanup = httpsCallable(functions, 'manualCleanup');
            // ส่ง allProjects ถ้าเลือก "ทุกโปรเจค"
            if (isAllProjects) {
                const projectsList = userProjects.filter(p => !p.isAll).map(p => ({ userId: p.userId, projectId: p.id }));
                const result = await manualCleanup({ allProjects: projectsList, targets });
                alert(`✅ ${result.data.message}`);
            } else {
                const result = await manualCleanup({ projectId: parsed.projectId, userId: parsed.userId, targets });
                alert(`✅ ${result.data.message}`);
            }
            fetchStorageStats(); // Refresh stats
        } catch (err) {
            console.error('Manual cleanup error:', err);
            alert('เกิดข้อผิดพลาด: ' + err.message);
        } finally {
            setCleaningUp(false);
        }
    };

    // Tab Components - Main tabs only
    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
        { id: 'credit', label: 'เครดิต', icon: CreditCard },
        { id: 'storage', label: 'Storage', icon: Database }
    ];

    // Credit Sub-tabs
    const creditSubTabs = [
        { id: 'deposits', label: 'เติมเงิน', icon: ArrowUpRight },
        { id: 'withdrawals', label: 'ถอนเงิน', icon: ArrowDownRight },
        { id: 'subscriptions', label: 'Subscription', icon: Crown },
        { id: 'manager', label: 'Credit Manager', icon: Users }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-red-900 via-slate-900 to-slate-950 text-white p-8 font-sans relative overflow-hidden">
            {/* Subtle Background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/10 via-transparent to-transparent" />
            </div>

            {/* Header - Unified Style */}
            <div className="max-w-7xl mx-auto mb-8 relative">
                <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform duration-300">
                                <BarChart3 className="text-white" size={32} />
                            </div>
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-red-100 to-orange-200 tracking-tight">
                                Admin Command Center
                            </h1>
                            <p className="text-base text-slate-400 font-light flex items-center gap-2 mt-1">
                                <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                                ระบบจัดการการเงินและผู้ใช้งาน
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="max-w-7xl mx-auto mb-8 relative">
                {/* Main Tabs + Sub-Tabs in one container */}
                <div className="bg-black/40 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl shadow-black/50">
                    {/* Main Tabs Row */}
                    <div className="inline-flex flex-wrap gap-2">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            const pendingCount = tab.id === 'credit' ? (stats.pendingDeposits + stats.pendingWithdrawals) : 0;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`group relative flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all duration-300 whitespace-nowrap ${
                                        isActive 
                                            ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-lg shadow-red-500/40' 
                                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                    }`}
                                >
                                    <Icon size={20} className={`transition-transform duration-300 ${isActive ? '' : 'group-hover:rotate-12'}`} />
                                    {tab.label}
                                    {pendingCount > 0 && (
                                        <span className="bg-yellow-400 text-black text-xs font-black px-2.5 py-1 rounded-full animate-pulse shadow-lg shadow-yellow-500/50">{pendingCount}</span>
                                    )}
                                    {isActive && <span className="absolute inset-0 rounded-xl bg-white/10 animate-pulse" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Credit Sub-Tabs Row - แสดงใต้ Main Tabs */}
                    {activeTab === 'credit' && (
                        <div className="mt-2 pt-2 border-t border-white/10">
                            <div className="inline-flex gap-1 bg-white/5 p-1.5 rounded-xl">
                                {creditSubTabs.map((sub) => {
                                    const SubIcon = sub.icon;
                                    const isSubActive = creditSubTab === sub.id;
                                    const subPending = sub.id === 'deposits' ? stats.pendingDeposits : sub.id === 'withdrawals' ? stats.pendingWithdrawals : sub.id === 'subscriptions' ? subscriptionPayments.filter(p => p.status === 'pending').length : 0;
                                    return (
                                        <button
                                            key={sub.id}
                                            onClick={() => setCreditSubTab(sub.id)}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                                isSubActive 
                                                    ? 'bg-white/15 text-white border border-white/20' 
                                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                                            }`}
                                        >
                                            <SubIcon size={16} />
                                            {sub.label}
                                            {subPending > 0 && (
                                                <span className="bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded-full">{subPending}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto">
                {/* Dashboard Tab */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-6">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                            <div className="group relative bg-gradient-to-br from-green-600/30 to-green-900/20 backdrop-blur-xl rounded-3xl border border-green-500/30 p-6 hover:scale-105 hover:shadow-2xl hover:shadow-green-500/20 transition-all duration-500 cursor-pointer overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/5 to-green-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                <div className="flex items-center justify-between mb-4">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30 group-hover:animate-bounce">
                                        <TrendingUp className="text-white" size={28} />
                                    </div>
                                    <span className="text-green-400 text-sm font-bold uppercase tracking-wider">ยอดฝากรวม</span>
                                </div>
                                <p className="text-4xl font-black text-white mb-1 tracking-tight">{stats.totalDeposits.toLocaleString()}</p>
                                <p className="text-sm text-green-300/80 font-medium">TOKEN</p>
                            </div>

                            <div className="group relative bg-gradient-to-br from-red-600/30 to-red-900/20 backdrop-blur-xl rounded-3xl border border-red-500/30 p-6 hover:scale-105 hover:shadow-2xl hover:shadow-red-500/20 transition-all duration-500 cursor-pointer overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/5 to-red-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                <div className="flex items-center justify-between mb-4">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:animate-bounce">
                                        <TrendingDown className="text-white" size={28} />
                                    </div>
                                    <span className="text-red-400 text-sm font-bold uppercase tracking-wider">ยอดถอนรวม</span>
                                </div>
                                <p className="text-4xl font-black text-white mb-1 tracking-tight">{stats.totalWithdrawals.toLocaleString()}</p>
                                <p className="text-sm text-red-300/80 font-medium">TOKEN</p>
                            </div>

                            <div className="group relative bg-gradient-to-br from-blue-600/30 to-blue-900/20 backdrop-blur-xl rounded-3xl border border-blue-500/30 p-6 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-500 cursor-pointer overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                <div className="flex items-center justify-between mb-4">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:animate-bounce">
                                        <Users className="text-white" size={28} />
                                    </div>
                                    <span className="text-blue-400 text-sm font-bold uppercase tracking-wider">ผู้ใช้ทั้งหมด</span>
                                </div>
                                <p className="text-4xl font-black text-white mb-1 tracking-tight">{stats.totalUsers}</p>
                                <p className="text-sm text-blue-300/70">คน</p>
                            </div>

                            <div className="group relative bg-gradient-to-br from-purple-600/30 to-purple-900/20 backdrop-blur-xl rounded-3xl border border-purple-500/30 p-6 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20 transition-all duration-500 cursor-pointer overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-purple-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                <div className="flex items-center justify-between mb-4">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:animate-bounce">
                                        <Wallet className="text-white" size={28} />
                                    </div>
                                    <span className="text-purple-400 text-sm font-bold uppercase tracking-wider">เครดิตรวม</span>
                                </div>
                                <p className="text-4xl font-black text-white mb-1 tracking-tight">{stats.totalBalance.toLocaleString()}</p>
                                <p className="text-sm text-purple-300/80 font-medium">TOKEN</p>
                            </div>
                        </div>

                        {/* Pending Summary */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="group relative bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 hover:bg-white/10 transition-all duration-300 overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-2xl group-hover:bg-green-500/20 transition-all duration-500" />
                                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                                        <ArrowUpRight className="text-green-400" size={18} />
                                    </div>
                                    รอดำเนินการ - ฝากเงิน
                                </h3>
                                <div className="text-center py-8">
                                    <p className="text-6xl font-black text-yellow-400 animate-pulse">{stats.pendingDeposits}</p>
                                    <p className="text-slate-400 mt-2 font-medium">รายการรอตรวจสอบ</p>
                                    {stats.pendingDeposits > 0 && (
                                        <button 
                                            onClick={() => setActiveTab('deposits')}
                                            className="mt-4 px-6 py-3 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-300 rounded-xl hover:from-yellow-500/30 hover:to-orange-500/30 transition-all font-semibold border border-yellow-500/30 hover:scale-105"
                                        >
                                            ดูรายการ →
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="group relative bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 hover:bg-white/10 transition-all duration-300 overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-all duration-500" />
                                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                                        <ArrowDownRight className="text-red-400" size={18} />
                                    </div>
                                    รอดำเนินการ - ถอนเงิน
                                </h3>
                                <div className="text-center py-8">
                                    <p className="text-6xl font-black text-yellow-400 animate-pulse">{stats.pendingWithdrawals}</p>
                                    <p className="text-slate-400 mt-2 font-medium">รายการรอตรวจสอบ</p>
                                    {stats.pendingWithdrawals > 0 && (
                                        <button 
                                            onClick={() => setActiveTab('withdrawals')}
                                            className="mt-4 px-6 py-3 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-300 rounded-xl hover:from-yellow-500/30 hover:to-orange-500/30 transition-all font-semibold border border-yellow-500/30 hover:scale-105"
                                        >
                                            ดูรายการ →
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Recent Activity */}
                        <div className="relative bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-purple-500 to-blue-500" />
                            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center shadow-lg">
                                    <Clock className="text-white" size={20} />
                                </div>
                                กิจกรรมล่าสุด
                                <span className="ml-auto text-sm font-normal text-slate-400">{filteredActivities.length} รายการ</span>
                            </h3>
                            
                            {/* Filters */}
                            <div className="flex flex-wrap gap-3 mb-5">
                                <input
                                    type="text"
                                    value={activitySearch}
                                    onChange={(e) => setActivitySearch(e.target.value)}
                                    placeholder="🔍 ค้นหา email..."
                                    className="flex-1 min-w-[200px] bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                                />
                                <GlassDropdown
                                    value={activityTypeFilter}
                                    onChange={setActivityTypeFilter}
                                    options={[
                                        { value: 'all', label: 'ทุกประเภท' },
                                        { value: 'deposit', label: 'เติมเงิน' },
                                        { value: 'withdrawal', label: 'ถอนเงิน' }
                                    ]}
                                    buttonClassName="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 cursor-pointer hover:bg-black/60 transition-all"
                                />
                                <GlassDropdown
                                    value={activityApproverFilter}
                                    onChange={setActivityApproverFilter}
                                    options={[
                                        { value: 'all', label: 'ผู้อนุมัติทั้งหมด' },
                                        { value: 'admin', label: 'Admin' },
                                        { value: 'other', label: 'อื่นๆ' }
                                    ]}
                                    buttonClassName="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 cursor-pointer hover:bg-black/60 transition-all"
                                />
                            </div>

                            <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                                {filteredActivities.map((log, index) => (
                                    <div 
                                        key={log.id} 
                                        className="group flex items-center justify-between bg-black/30 rounded-xl p-4 border border-white/5 hover:bg-black/50 hover:border-white/20 transition-all duration-300 hover:scale-[1.02]"
                                        style={{ animationDelay: `${index * 50}ms` }}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110 ${
                                                log.type === 'withdrawal' ? 'bg-gradient-to-br from-red-500 to-red-700' : 'bg-gradient-to-br from-green-500 to-green-700'
                                            }`}>
                                                {log.type === 'withdrawal' ? <ArrowDownRight className="text-white" size={20} /> : <ArrowUpRight className="text-white" size={20} />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-white">{log.userEmail}</p>
                                                <p className="text-xs text-slate-500">{log.createdAt?.toDate?.().toLocaleString('th-TH')}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-bold ${log.type === 'withdrawal' ? 'text-red-400' : 'text-green-400'}`}>
                                                {log.type === 'withdrawal' ? '-' : '+'}{Math.abs(log.amount)} TOKEN
                                            </p>
                                            <p className="text-xs text-slate-500">โดย <span className="text-purple-300">{formatApprover(log.reviewedByEmail)}</span></p>
                                        </div>
                                    </div>
                                ))}
                                {filteredActivities.length === 0 && <p className="text-slate-500 text-center py-4">ไม่พบกิจกรรม</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* Deposits Tab */}
                {activeTab === 'credit' && creditSubTab === 'deposits' && (
                    <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 shadow-2xl overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500" />
                        <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl" />
                        
                        <div className="flex items-center gap-4 mb-8 relative">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30 group-hover:animate-pulse">
                                    <ArrowUpRight className="text-white" size={32} />
                                </div>
                                {paymentRequests.filter(r => r.status === 'pending').length > 0 && (
                                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center text-xs font-bold text-black animate-bounce">
                                        {paymentRequests.filter(r => r.status === 'pending').length}
                                    </div>
                                )}
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-300 to-emerald-400">อนุมัติเติมเงิน</h2>
                                <p className="text-slate-400 mt-1">ตรวจสอบสลิปและอนุมัติการเติมเครดิต</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                            <div className="xl:col-span-2 space-y-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                                    รายการรอดำเนินการ ({paymentRequests.filter(r => r.status === 'pending').length})
                                </h3>
                                {loadingPayments ? (
                                    <div className="text-slate-400 flex items-center gap-2 justify-center py-12"><Loader2 size={24} className="animate-spin" /> กำลังโหลด...</div>
                                ) : paymentRequests.filter(req => req.status === 'pending').length === 0 ? (
                                    <div className="text-slate-400 bg-black/30 rounded-2xl p-12 text-center border border-white/5">
                                        <CheckCircle size={48} className="mx-auto mb-3 text-green-500" />
                                        <p className="font-medium">ไม่มีรายการรอดำเนินการ</p>
                                    </div>
                                ) : (
                                    paymentRequests.filter(req => req.status === 'pending').map((req, index) => (
                                        <div key={req.id} className="group bg-black/40 border border-white/10 rounded-2xl p-5 hover:bg-black/60 hover:border-green-500/30 transition-all duration-300 hover:scale-[1.01]" style={{ animationDelay: `${index * 100}ms` }}>
                                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-lg">
                                                        <CreditCard className="text-white" size={24} />
                                                    </div>
                                                    <div>
                                                        <p className="text-white font-semibold text-lg">{req.userEmail || 'Unknown User'}</p>
                                                        <p className="text-3xl font-black text-green-400 my-1">{req.amount} <span className="text-lg font-medium">TOKEN</span></p>
                                                        <p className="text-xs text-slate-500 flex items-center gap-1">
                                                            <Clock size={12} /> {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleString('th-TH') : 'รอเวลา'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    {req.slipUrl && (
                                                        <a href={req.slipUrl} target="_blank" rel="noopener noreferrer"
                                                            className="px-5 py-3 rounded-xl bg-white/10 text-slate-200 text-sm flex items-center gap-2 hover:bg-white/20 hover:scale-105 transition-all border border-white/10">
                                                            🧾 ดูสลิป <ExternalLink size={14} />
                                                        </a>
                                                    )}
                                                    <button onClick={() => handleApprovePayment(req)} disabled={processingPaymentId === req.id}
                                                        className="px-5 py-3 rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white hover:from-green-500 hover:to-green-400 transition-all text-sm flex items-center gap-2 disabled:opacity-50 font-semibold shadow-lg shadow-green-500/30 hover:scale-105">
                                                        {processingPaymentId === req.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} อนุมัติ
                                                    </button>
                                                    <button onClick={() => handleRejectPayment(req)} disabled={processingPaymentId === req.id}
                                                        className="px-5 py-3 rounded-xl bg-red-500/20 text-red-300 hover:bg-red-500 hover:text-white transition-all text-sm flex items-center gap-2 disabled:opacity-50 font-semibold border border-red-500/30 hover:scale-105">
                                                        <XCircle size={16} /> ปฏิเสธ
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Clock size={18} className="text-green-400" />
                                    ประวัติการอนุมัติ
                                </h3>
                                <div className="bg-black/40 border border-white/10 rounded-2xl p-4 max-h-[600px] overflow-y-auto custom-scrollbar space-y-3">
                                    {loadingLogs ? (
                                        <div className="text-slate-400 flex items-center gap-2 justify-center py-8"><Loader2 size={20} className="animate-spin" /> กำลังโหลด...</div>
                                    ) : paymentLogs.filter(l => l.type !== 'withdrawal').length === 0 ? (
                                        <div className="text-slate-500 text-sm text-center py-8">ยังไม่มีประวัติ</div>
                                    ) : (
                                        paymentLogs.filter(l => l.type !== 'withdrawal').map((log, index) => (
                                            <div key={log.id} className="group border border-white/10 rounded-xl p-4 bg-black/30 hover:bg-black/50 hover:border-white/20 transition-all duration-300">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-sm font-semibold text-white">{log.userEmail}</p>
                                                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                                                        log.status === 'approved' ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                                    }`}>
                                                        {log.status === 'approved' ? '✓ อนุมัติ' : '✗ ปฏิเสธ'}
                                                    </span>
                                                </div>
                                                <p className="text-xl font-black text-green-400">+{log.amount} TOKEN</p>
                                                <p className="text-xs text-slate-500 mt-1">{log.createdAt?.toDate?.().toLocaleString('th-TH')}</p>
                                                <p className="text-xs text-slate-400 mt-1">โดย: <span className="text-purple-300 font-medium">{formatApprover(log.reviewedByEmail)}</span></p>
                                                {log.slipUrl && (
                                                    <a href={log.slipUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-red-300 inline-flex items-center gap-1 mt-2 hover:text-red-200">
                                                        🧾 ดูสลิป <ExternalLink size={10} />
                                                    </a>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Withdrawals Tab */}
                {activeTab === 'credit' && creditSubTab === 'withdrawals' && (
                    <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 shadow-2xl overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500" />
                        <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full blur-3xl" />
                        
                        <div className="flex items-center gap-4 mb-8 relative">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
                                    <ArrowDownRight className="text-white" size={32} />
                                </div>
                                {withdrawalRequests.filter(r => r.status === 'pending').length > 0 && (
                                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center text-xs font-bold text-black animate-bounce">
                                        {withdrawalRequests.filter(r => r.status === 'pending').length}
                                    </div>
                                )}
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-300 to-orange-400">อนุมัติถอนเงิน</h2>
                                <p className="text-slate-400 mt-1">ตรวจสอบบัญชีและอนุมัติการถอนเครดิต</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                            <div className="xl:col-span-2 space-y-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                                    รายการรอดำเนินการ ({withdrawalRequests.filter(r => r.status === 'pending').length})
                                </h3>
                                {loadingWithdrawals ? (
                                    <div className="text-slate-400 flex items-center gap-2 justify-center py-12"><Loader2 size={24} className="animate-spin" /> กำลังโหลด...</div>
                                ) : withdrawalRequests.filter(req => req.status === 'pending').length === 0 ? (
                                    <div className="text-slate-400 bg-black/30 rounded-2xl p-12 text-center border border-white/5">
                                        <CheckCircle size={48} className="mx-auto mb-3 text-green-500" />
                                        <p className="font-medium">ไม่มีรายการรอดำเนินการ</p>
                                    </div>
                                ) : (
                                    withdrawalRequests.filter(req => req.status === 'pending').map((req, index) => (
                                        <div key={req.id} className="group bg-black/40 border border-white/10 rounded-2xl p-5 hover:bg-black/60 hover:border-red-500/30 transition-all duration-300 hover:scale-[1.01]">
                                            <div className="flex flex-col gap-4">
                                                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg">
                                                            <Wallet className="text-white" size={24} />
                                                        </div>
                                                        <div>
                                                            <p className="text-white font-semibold text-lg">{req.userEmail || 'Unknown User'}</p>
                                                            <p className="text-3xl font-black text-red-400 my-1">-{req.amount} <span className="text-lg font-medium">TOKEN</span></p>
                                                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                                                <Clock size={12} /> {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleString('th-TH') : 'รอเวลา'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-4 border border-blue-500/20 shadow-lg">
                                                        <p className="text-xs text-blue-300 mb-2 font-medium">🏦 บัญชีปลายทาง</p>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Building2 size={18} className="text-blue-400" />
                                                            <span className="text-white font-bold">{req.bankName}</span>
                                                        </div>
                                                        <p className="text-xl font-mono text-white tracking-wider">{req.accountNumber}</p>
                                                        <p className="text-sm text-slate-300 mt-1">{req.accountName}</p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/10">
                                                    <button onClick={() => handleApproveWithdrawal(req)} disabled={processingWithdrawalId === req.id}
                                                        className="px-5 py-3 rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white hover:from-green-500 hover:to-green-400 transition-all text-sm flex items-center gap-2 disabled:opacity-50 font-semibold shadow-lg shadow-green-500/30 hover:scale-105">
                                                        {processingWithdrawalId === req.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} อนุมัติ (โอนแล้ว)
                                                    </button>
                                                    <button onClick={() => handleRejectWithdrawal(req)} disabled={processingWithdrawalId === req.id}
                                                        className="px-5 py-3 rounded-xl bg-red-500/20 text-red-300 hover:bg-red-500 hover:text-white transition-all text-sm flex items-center gap-2 disabled:opacity-50 font-semibold border border-red-500/30 hover:scale-105">
                                                        <XCircle size={16} /> ปฏิเสธ
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Clock size={18} className="text-red-400" />
                                    ประวัติการถอน
                                </h3>
                                <div className="bg-black/40 border border-white/10 rounded-2xl p-4 max-h-[600px] overflow-y-auto custom-scrollbar space-y-3">
                                    {withdrawalRequests.filter(w => w.status !== 'pending').length === 0 ? (
                                        <div className="text-slate-500 text-sm text-center py-8">ยังไม่มีประวัติ</div>
                                    ) : (
                                        withdrawalRequests.filter(w => w.status !== 'pending').map(req => (
                                            <div key={req.id} className="group border border-white/10 rounded-xl p-4 bg-black/30 hover:bg-black/50 hover:border-white/20 transition-all duration-300">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-sm font-semibold text-white">{req.userEmail}</p>
                                                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                                                        req.status === 'approved' ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                                    }`}>
                                                        {req.status === 'approved' ? '✓ อนุมัติ' : '✗ ปฏิเสธ'}
                                                    </span>
                                                </div>
                                                <p className="text-xl font-black text-red-400">-{req.amount} TOKEN</p>
                                                <p className="text-xs text-slate-400 mt-1">{req.bankName} • {req.accountNumber}</p>
                                                <p className="text-xs text-slate-500 mt-1">{req.reviewedAt?.toDate?.().toLocaleString('th-TH')}</p>
                                                <p className="text-xs text-slate-400 mt-1">โดย: <span className="text-purple-300 font-medium">{formatApprover(req.reviewedByEmail)}</span></p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Subscriptions Tab */}
                {activeTab === 'credit' && creditSubTab === 'subscriptions' && (
                    <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 shadow-2xl overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500" />
                        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
                        
                        <div className="flex items-center gap-4 mb-8 relative">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                    <Crown className="text-white" size={32} />
                                </div>
                                {subscriptionPayments.filter(r => r.status === 'pending').length > 0 && (
                                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center text-xs font-bold text-black animate-bounce">
                                        {subscriptionPayments.filter(r => r.status === 'pending').length}
                                    </div>
                                )}
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-400">อนุมัติ Subscription</h2>
                                <p className="text-slate-400 mt-1">ตรวจสอบสลิปและอนุมัติการสมัครสมาชิก</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                            <div className="xl:col-span-2 space-y-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                                    รายการรอดำเนินการ ({subscriptionPayments.filter(r => r.status === 'pending').length})
                                </h3>
                                {loadingSubPayments ? (
                                    <div className="text-slate-400 flex items-center gap-2 justify-center py-12"><Loader2 size={24} className="animate-spin" /> กำลังโหลด...</div>
                                ) : subscriptionPayments.filter(req => req.status === 'pending').length === 0 ? (
                                    <div className="text-slate-400 bg-black/30 rounded-2xl p-12 text-center border border-white/5">
                                        <CheckCircle size={48} className="mx-auto mb-3 text-green-500" />
                                        <p className="font-medium">ไม่มีรายการรอดำเนินการ</p>
                                    </div>
                                ) : (
                                    subscriptionPayments.filter(req => req.status === 'pending').map((req) => (
                                        <div key={req.id} className="group bg-black/40 border border-white/10 rounded-2xl p-5 hover:bg-black/60 hover:border-purple-500/30 transition-all duration-300 hover:scale-[1.01]">
                                            <div className="flex flex-col gap-4">
                                                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${
                                                            req.tier === 'Premium' ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-purple-500 to-pink-600'
                                                        }`}>
                                                            {req.tier === 'Premium' ? <Star className="text-white" size={24} /> : <Crown className="text-white" size={24} />}
                                                        </div>
                                                        <div>
                                                            <p className="text-white font-semibold text-lg">{req.userEmail || 'Unknown User'}</p>
                                                            <p className="text-2xl font-black text-purple-400 my-1">{formatPrice(req.amount)}</p>
                                                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                                                <Clock size={12} /> {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleString('th-TH') : 'รอเวลา'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="bg-gradient-to-br from-purple-800/50 to-pink-900/50 rounded-xl p-4 border border-purple-500/20 shadow-lg">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                                                                req.tier === 'Premium' ? 'bg-amber-500/20 text-amber-300' : 'bg-purple-500/20 text-purple-300'
                                                            }`}>
                                                                {req.tier}
                                                            </span>
                                                            {req.isProrate && <span className="px-2 py-1 rounded-lg text-xs bg-blue-500/20 text-blue-300">Prorate</span>}
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-3 text-center">
                                                            <div>
                                                                <p className="text-lg font-bold text-purple-300">{req.limits?.projects || 1}</p>
                                                                <p className="text-xs text-slate-400">Projects</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-lg font-bold text-blue-300">{req.limits?.modes || 2}</p>
                                                                <p className="text-xs text-slate-400">Modes</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-lg font-bold text-green-300">{req.limits?.extenders || 2}</p>
                                                                <p className="text-xs text-slate-400">Extenders</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/10">
                                                    {req.slipUrl && (
                                                        <a href={req.slipUrl} target="_blank" rel="noopener noreferrer"
                                                            className="px-4 py-2 rounded-xl bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-all text-sm flex items-center gap-2 border border-purple-500/30">
                                                            🧾 ดูสลิป <ExternalLink size={14} />
                                                        </a>
                                                    )}
                                                    <button onClick={() => handleApproveSubscription(req)} disabled={processingSubPaymentId === req.id}
                                                        className="px-5 py-3 rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white hover:from-green-500 hover:to-green-400 transition-all text-sm flex items-center gap-2 disabled:opacity-50 font-semibold shadow-lg shadow-green-500/30 hover:scale-105">
                                                        {processingSubPaymentId === req.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} อนุมัติ
                                                    </button>
                                                    <button onClick={() => handleRejectSubscription(req)} disabled={processingSubPaymentId === req.id}
                                                        className="px-5 py-3 rounded-xl bg-red-500/20 text-red-300 hover:bg-red-500 hover:text-white transition-all text-sm flex items-center gap-2 disabled:opacity-50 font-semibold border border-red-500/30 hover:scale-105">
                                                        <XCircle size={16} /> ปฏิเสธ
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Clock size={18} className="text-purple-400" />
                                    ประวัติ Subscription
                                </h3>
                                <div className="bg-black/40 border border-white/10 rounded-2xl p-4 max-h-[600px] overflow-y-auto custom-scrollbar space-y-3">
                                    {subscriptionPayments.filter(s => s.status !== 'pending').length === 0 ? (
                                        <div className="text-slate-500 text-sm text-center py-8">ยังไม่มีประวัติ</div>
                                    ) : (
                                        subscriptionPayments.filter(s => s.status !== 'pending').map(req => (
                                            <div key={req.id} className="group border border-white/10 rounded-xl p-4 bg-black/30 hover:bg-black/50 hover:border-white/20 transition-all duration-300">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-sm font-semibold text-white">{req.userEmail}</p>
                                                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                                                        req.status === 'approved' ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                                    }`}>
                                                        {req.status === 'approved' ? '✓ อนุมัติ' : '✗ ปฏิเสธ'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 rounded text-xs ${
                                                        req.tier === 'Premium' ? 'bg-amber-500/20 text-amber-300' : 'bg-purple-500/20 text-purple-300'
                                                    }`}>{req.tier}</span>
                                                    <span className="text-lg font-bold text-purple-400">{formatPrice(req.amount)}</span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">{req.reviewedAt?.toDate?.().toLocaleString('th-TH')}</p>
                                                <p className="text-xs text-slate-400 mt-1">โดย: <span className="text-purple-300 font-medium">{formatApprover(req.reviewedByEmail)}</span></p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Credit Manager Tab */}
                {activeTab === 'credit' && creditSubTab === 'manager' && (
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <div className="xl:col-span-2 relative bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 shadow-2xl overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500" />
                            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
                            
                            <div className="flex items-center gap-4 mb-8 relative">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                    <Users className="text-white" size={32} />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-400">Credit Manager</h2>
                                    <p className="text-slate-400 mt-1">จัดการเครดิตผู้ใช้งานทั้งหมด • {allUsers.length} คน</p>
                                </div>
                            </div>

                            {loadingUsers ? (
                                <div className="text-slate-400 flex items-center gap-2 justify-center py-12"><Loader2 size={24} className="animate-spin" /> กำลังโหลดข้อมูลผู้ใช้...</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-white/20 bg-black/20">
                                                <th className="text-left py-4 px-4 text-purple-300 font-bold">ผู้ใช้</th>
                                                <th className="text-right py-4 px-4 text-green-300 font-bold">ยอดฝากรวม</th>
                                                <th className="text-right py-4 px-4 text-red-300 font-bold">ยอดถอนรวม</th>
                                                <th className="text-right py-4 px-4 text-yellow-300 font-bold">เครดิตคงเหลือ</th>
                                                <th className="text-center py-4 px-4 text-slate-300 font-bold">จัดการ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allUsers.map((user, index) => {
                                                const userStats = getUserStats(user.id);
                                                const userEmail = user.email || paymentLogs.find(l => l.userId === user.id)?.userEmail || user.id;
                                                return (
                                                    <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                        <td className="py-4 px-4">
                                                            <p className="text-white font-medium">{userEmail}</p>
                                                            <p className="text-xs text-slate-500">{user.displayName || 'ไม่ระบุชื่อ'}</p>
                                                        </td>
                                                        <td className="py-4 px-4 text-right">
                                                            <p className="text-green-400 font-medium">+{userStats.totalDeposit.toLocaleString()}</p>
                                                            <p className="text-xs text-slate-500">{userStats.depositCount} ครั้ง</p>
                                                        </td>
                                                        <td className="py-4 px-4 text-right">
                                                            <p className="text-red-400 font-medium">-{userStats.totalWithdraw.toLocaleString()}</p>
                                                            <p className="text-xs text-slate-500">{userStats.withdrawCount} ครั้ง</p>
                                                        </td>
                                                        <td className="py-4 px-4 text-right">
                                                            <p className="text-2xl font-bold text-white">{(user.walletBalance || 0).toLocaleString()}</p>
                                                            <p className="text-xs text-slate-500">TOKEN</p>
                                                        </td>
                                                        <td className="py-4 px-4 text-center">
                                                            <button
                                                                onClick={() => { setSelectedUser({ ...user, email: userEmail }); setShowCreditModal(true); }}
                                                                className="px-3 py-2 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500 hover:text-white transition-all text-sm flex items-center gap-2 mx-auto"
                                                            >
                                                                <Edit3 size={14} /> แก้ไขเครดิต
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {allUsers.length === 0 && (
                                        <p className="text-slate-500 text-center py-8">ไม่พบผู้ใช้งาน</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Admin Credit Logs */}
                        <div className="bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 shadow-2xl">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Edit3 className="text-purple-400" size={18} />
                                ประวัติการแก้ไขเครดิต
                            </h3>
                            {loadingCreditLogs ? (
                                <div className="text-slate-400 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> กำลังโหลด...</div>
                            ) : adminCreditLogs.length === 0 ? (
                                <div className="text-slate-500 text-sm text-center py-8">ยังไม่มีประวัติการแก้ไข</div>
                            ) : (
                                <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                                    {adminCreditLogs.map(log => {
                                        const isAdd = log.amount > 0;
                                        const adminDisplay = log.adminEmail?.includes('fxfarm.dashboard') ? 'Admin' : (log.adminEmail?.split('@')[0] || 'Admin');
                                        return (
                                            <div key={log.id} className="bg-black/40 border border-white/10 rounded-xl p-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-sm font-medium text-white">{log.userEmail}</p>
                                                    <span className={`text-lg font-bold ${isAdd ? 'text-green-400' : 'text-red-400'}`}>
                                                        {isAdd ? '+' : ''}{log.amount} TOKEN
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-400 mb-2">
                                                    <span className="text-purple-300">เหตุผล:</span> {log.reason || '-'}
                                                </p>
                                                <div className="flex items-center justify-between text-[11px] text-slate-500">
                                                    <span>โดย: <span className="text-purple-300 font-medium">{adminDisplay}</span></span>
                                                    <span>{log.createdAt?.toDate?.().toLocaleString('th-TH')}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Storage Dashboard Tab */}
                {activeTab === 'storage' && (
                    <div className="space-y-6">
                        {/* Project Selector & Actions */}
                        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                                        <HardDrive className="text-white" size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Storage Dashboard</h2>
                                        <p className="text-slate-400 text-sm">จัดการพื้นที่จัดเก็บข้อมูล Firestore</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-3 items-center">
                                    <select
                                        value={selectedProjectForStorage}
                                        onChange={(e) => setSelectedProjectForStorage(e.target.value)}
                                        className="bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500 min-w-[200px]"
                                    >
                                        {userProjects.map(p => (
                                            <option key={`${p.userId}-${p.id}`} value={JSON.stringify({ userId: p.userId, projectId: p.id })}>{p.label}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={fetchStorageStats}
                                        disabled={loadingStorage}
                                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-all disabled:opacity-50"
                                    >
                                        {loadingStorage ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                                        โหลดข้อมูล
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        {storageStats && (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                                    {/* Episodes */}
                                    <div className="bg-gradient-to-br from-green-600/20 to-green-900/10 backdrop-blur-xl rounded-2xl border border-green-500/20 p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                                                <Database className="text-green-400" size={16} />
                                            </div>
                                            <span className="text-green-400 text-xs font-bold uppercase">Episodes</span>
                                        </div>
                                        <p className="text-2xl font-black text-white">{storageStats.stats.episodes.total}</p>
                                        <p className="text-xs text-green-300">Pending: {storageStats.stats.episodes.pending}</p>
                                        <p className="text-xs text-red-300">Used: {storageStats.stats.episodes.used}</p>
                                    </div>

                                    {/* Episode History */}
                                    <div className="bg-gradient-to-br from-blue-600/20 to-blue-900/10 backdrop-blur-xl rounded-2xl border border-blue-500/20 p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                                <Clock className="text-blue-400" size={16} />
                                            </div>
                                            <span className="text-blue-400 text-xs font-bold uppercase">History</span>
                                        </div>
                                        <p className="text-2xl font-black text-white">{storageStats.stats.episodeHistory.total}</p>
                                        <p className="text-xs text-yellow-300">Old (&gt;7d): {storageStats.stats.episodeHistory.oldItems}</p>
                                    </div>

                                    {/* Logs */}
                                    <div className="bg-gradient-to-br from-purple-600/20 to-purple-900/10 backdrop-blur-xl rounded-2xl border border-purple-500/20 p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                                <BarChart3 className="text-purple-400" size={16} />
                                            </div>
                                            <span className="text-purple-400 text-xs font-bold uppercase">Logs</span>
                                        </div>
                                        <p className="text-2xl font-black text-white">{storageStats.stats.logs.total}</p>
                                        <p className="text-xs text-yellow-300">Old (&gt;7d): {storageStats.stats.logs.oldItems}</p>
                                    </div>

                                    {/* Test Logs */}
                                    <div className="bg-gradient-to-br from-orange-600/20 to-orange-900/10 backdrop-blur-xl rounded-2xl border border-orange-500/20 p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                                                <ExternalLink className="text-orange-400" size={16} />
                                            </div>
                                            <span className="text-orange-400 text-xs font-bold uppercase">Test Logs</span>
                                        </div>
                                        <p className="text-2xl font-black text-white">{storageStats.stats.testLogs}</p>
                                        <p className="text-xs text-slate-400">TTL: 7 days</p>
                                    </div>

                                    {/* Ready Prompts */}
                                    <div className="bg-gradient-to-br from-pink-600/20 to-pink-900/10 backdrop-blur-xl rounded-2xl border border-pink-500/20 p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center">
                                                <Edit3 className="text-pink-400" size={16} />
                                            </div>
                                            <span className="text-pink-400 text-xs font-bold uppercase">Prompts</span>
                                        </div>
                                        <p className="text-2xl font-black text-white">{storageStats.stats.readyPrompts}</p>
                                        <p className="text-xs text-slate-400">Ready Prompts</p>
                                    </div>

                                    {/* Slots */}
                                    <div className="bg-gradient-to-br from-cyan-600/20 to-cyan-900/10 backdrop-blur-xl rounded-2xl border border-cyan-500/20 p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                                <Clock className="text-cyan-400" size={16} />
                                            </div>
                                            <span className="text-cyan-400 text-xs font-bold uppercase">Slots</span>
                                        </div>
                                        <p className="text-2xl font-black text-white">{storageStats.stats.slots}</p>
                                        <p className="text-xs text-slate-400">Time Slots</p>
                                    </div>

                                    {/* Backups */}
                                    <div className="bg-gradient-to-br from-slate-600/20 to-slate-900/10 backdrop-blur-xl rounded-2xl border border-slate-500/20 p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-8 h-8 rounded-lg bg-slate-500/20 flex items-center justify-center">
                                                <HardDrive className="text-slate-400" size={16} />
                                            </div>
                                            <span className="text-slate-400 text-xs font-bold uppercase">Backups</span>
                                        </div>
                                        <p className="text-2xl font-black text-white">{storageStats.stats.deletedBackups}</p>
                                        <p className="text-xs text-slate-400">Deleted Backups</p>
                                    </div>
                                </div>

                                {/* Cleanup Actions */}
                                <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                        <Trash2 className="text-red-400" size={20} />
                                        Manual Cleanup (ลบข้อมูลเก่ากว่า 7 วัน)
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                        <button
                                            onClick={() => handleManualCleanup(['logs'])}
                                            disabled={cleaningUp}
                                            className="px-4 py-3 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-300 rounded-xl transition-all disabled:opacity-50 text-sm font-medium"
                                        >
                                            🧹 Logs ({storageStats.cleanupEstimate.logs})
                                        </button>
                                        <button
                                            onClick={() => handleManualCleanup(['episodeHistory'])}
                                            disabled={cleaningUp}
                                            className="px-4 py-3 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-300 rounded-xl transition-all disabled:opacity-50 text-sm font-medium"
                                        >
                                            🧹 History ({storageStats.cleanupEstimate.episodeHistory})
                                        </button>
                                        <button
                                            onClick={() => handleManualCleanup(['usedEpisodes'])}
                                            disabled={cleaningUp}
                                            className="px-4 py-3 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-300 rounded-xl transition-all disabled:opacity-50 text-sm font-medium"
                                        >
                                            🧹 Used Episodes ({storageStats.cleanupEstimate.usedEpisodes})
                                        </button>
                                        <button
                                            onClick={() => handleManualCleanup(['testLogs'])}
                                            disabled={cleaningUp}
                                            className="px-4 py-3 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/30 text-orange-300 rounded-xl transition-all disabled:opacity-50 text-sm font-medium"
                                        >
                                            🧹 Test Logs
                                        </button>
                                        <button
                                            onClick={() => handleManualCleanup(['readyPrompts'])}
                                            disabled={cleaningUp}
                                            className="px-4 py-3 bg-pink-600/20 hover:bg-pink-600/40 border border-pink-500/30 text-pink-300 rounded-xl transition-all disabled:opacity-50 text-sm font-medium"
                                        >
                                            🧹 Prompts
                                        </button>
                                        <button
                                            onClick={() => handleManualCleanup(['all'])}
                                            disabled={cleaningUp}
                                            className="px-4 py-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white rounded-xl transition-all disabled:opacity-50 text-sm font-bold flex items-center justify-center gap-2"
                                        >
                                            {cleaningUp ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                            ล้างทั้งหมด
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-4">
                                        ⚠️ episodeHistory จะถูก Backup ไปยัง deletedBackups/ ก่อนลบ | Auto Clean ทำงานทุกวัน 02:00-05:00 UTC
                                    </p>
                                </div>
                            </>
                        )}

                        {!storageStats && !loadingStorage && (
                            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-12 text-center">
                                <Database className="text-slate-500 mx-auto mb-4" size={48} />
                                <p className="text-slate-400">เลือก Project แล้วกด "โหลดข้อมูล" เพื่อดูสถิติ Storage</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Credit Adjustment Modal */}
            {showCreditModal && selectedUser && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-white/20 rounded-2xl p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold text-white mb-4">แก้ไขเครดิต</h3>
                        <div className="bg-black/40 rounded-xl p-4 mb-4">
                            <p className="text-slate-400 text-sm">ผู้ใช้</p>
                            <p className="text-white font-medium">{selectedUser.email}</p>
                            <p className="text-slate-400 text-sm mt-2">เครดิตปัจจุบัน</p>
                            <p className="text-2xl font-bold text-white">{(selectedUser.walletBalance || 0).toLocaleString()} TOKEN</p>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-slate-300 mb-2 block">จำนวนเครดิต (+ เพิ่ม / - ลด)</label>
                                <input
                                    type="number"
                                    value={creditAdjustAmount}
                                    onChange={(e) => setCreditAdjustAmount(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                                    placeholder="เช่น 100 หรือ -50"
                                />
                            </div>
                            <div>
                                <label className="text-sm text-slate-300 mb-2 block">เหตุผล *</label>
                                <input
                                    type="text"
                                    value={creditAdjustReason}
                                    onChange={(e) => setCreditAdjustReason(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                                    placeholder="เช่น ชดเชยปัญหาระบบ, แก้ไขยอดผิดพลาด"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => { setShowCreditModal(false); setSelectedUser(null); setCreditAdjustAmount(''); setCreditAdjustReason(''); }}
                                className="flex-1 py-3 rounded-xl border border-white/20 text-white hover:bg-white/10 transition-all"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleAdjustCredit}
                                disabled={adjustingCredit}
                                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 text-white font-bold hover:from-purple-500 hover:to-purple-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {adjustingCredit ? <><Loader2 size={16} className="animate-spin" /> กำลังบันทึก...</> : 'ยืนยันการแก้ไข'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Admin;
