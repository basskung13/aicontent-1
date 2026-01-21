import React, { useState, useEffect, useRef } from 'react';
import { 
    Sparkles, Save, TestTube, Upload, Trash2, GripVertical,
    Send, Bot, Loader2, ChevronDown, ChevronUp, Copy, Check,
    MessageCircle, X, Paperclip, Store, Coins, Package, Eye, Edit3, Camera, Image,
    Plus, FolderPlus, MoveRight, ArrowUp, ArrowDown, Volume2, MoreVertical, Play, ExternalLink
} from 'lucide-react';
import GlassDropdown from '../components/ui/GlassDropdown';
import { auth, db, functions, storage } from '../firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';

// === DEFAULT GROUPS (Blocks สามารถลบ/ย้าย/ฟังเสียงได้) ===
const DEFAULT_GROUPS = [
    {
        id: 'default_language',
        name: '🌐 ภาษา',
        icon: '🌐',
        isDefault: true,
        blocks: [
            { id: 'block_th', name: 'ไทย', flag: 'th', instruction: 'All spoken dialogue and narration must be in Thai language. Use natural Thai expressions.' },
            { id: 'block_en', name: 'อังกฤษ', flag: 'gb', instruction: 'All spoken dialogue and narration must be in English. Use natural English expressions.' },
            { id: 'block_jp', name: 'ญี่ปุ่น', flag: 'jp', instruction: 'All spoken dialogue must be in Japanese. Use natural Japanese expressions and honorifics.' },
            { id: 'block_kr', name: 'เกาหลี', flag: 'kr', instruction: 'All spoken dialogue must be in Korean. Use natural Korean expressions.' },
            { id: 'block_cn', name: 'จีน', flag: 'cn', instruction: 'All spoken dialogue must be in Mandarin Chinese. Use natural Chinese expressions.' },
            { id: 'block_isan', name: 'อีสาน', icon: '🏠', instruction: 'All spoken dialogue must be in Isan dialect. Use authentic Isan expressions and vocabulary.' },
        ]
    },
    {
        id: 'default_style',
        name: '🎨 สไตล์ภาพ',
        icon: '🎨',
        isDefault: true,
        blocks: [
            { id: 'block_cinematic', name: '🎬 Cinematic', instruction: 'Use cinematic camera angles: Wide shots, Close-ups, Slow motion. Include lens flares and depth of field.' },
            { id: 'block_anime', name: '✨ Anime Style', instruction: 'Anime visual style: expressive eyes, dramatic reactions, speed lines, sparkle effects.' },
            { id: 'block_realistic', name: '📷 Realistic', instruction: 'Photorealistic style with natural lighting and real-world textures.' },
            { id: 'block_vintage', name: '📺 Vintage/Retro', instruction: 'Vintage film look: grain, muted colors, vignette, old film aesthetics.' },
            { id: 'block_cartoon', name: '🎨 Cartoon', instruction: 'Cartoon/Animation style with bold colors and exaggerated expressions.' },
            { id: 'block_noir', name: '🖤 Film Noir', instruction: 'Black and white, high contrast, dramatic shadows, detective movie style.' },
        ]
    },
    {
        id: 'default_mood',
        name: '🎭 อารมณ์',
        icon: '🎭',
        isDefault: true,
        blocks: [
            { id: 'block_emotional', name: '😢 Emotional', instruction: 'Focus on character emotions: tears, smiles, detailed facial expressions.' },
            { id: 'block_happy', name: '😊 Happy/Cheerful', instruction: 'Bright, joyful atmosphere. Characters smiling, laughing, celebrating.' },
            { id: 'block_sad', name: '😭 Sad/Melancholy', instruction: 'Melancholic mood. Tears, rain, muted colors, slow movements.' },
            { id: 'block_tense', name: '😰 Tense/Suspense', instruction: 'Build tension and suspense. Quick cuts, dramatic music, shadows.' },
            { id: 'block_romantic', name: '💕 Romantic', instruction: 'Romantic atmosphere. Soft lighting, warm colors, intimate moments.' },
            { id: 'block_horror', name: '👻 Horror/Scary', instruction: 'Horror atmosphere. Dark shadows, jump scares, eerie sounds.' },
        ]
    },
    {
        id: 'default_lighting',
        name: '💡 แสง',
        icon: '💡',
        isDefault: true,
        blocks: [
            { id: 'block_golden', name: '🌅 Golden Hour', instruction: 'Warm golden sunlight. Soft shadows, orange and yellow tones.' },
            { id: 'block_night', name: '🌙 Night Scene', instruction: 'Night time. Cool blue tones, moonlight, city lights.' },
            { id: 'block_rain', name: '🌧️ ฝนตก', instruction: 'Rainy scene. Wet surfaces, reflections, rain sounds.' },
            { id: 'block_neon', name: '� Neon/Cyberpunk', instruction: 'Neon lights, cyberpunk aesthetic, pink/blue/purple colors.' },
            { id: 'block_studio', name: '💡 Studio Lighting', instruction: 'Professional studio lighting. Clean, well-lit, no harsh shadows.' },
            { id: 'block_natural', name: '☀️ Natural Light', instruction: 'Natural daylight. Realistic outdoor lighting.' },
        ]
    },
    {
        id: 'default_audio',
        name: '🔊 เสียง',
        icon: '🔊',
        isDefault: true,
        blocks: [
            { id: 'block_bgm_soft', name: '🎵 BGM Soft', instruction: 'Soft piano, gentle strings, acoustic guitar. Emotional soundtrack.' },
            { id: 'block_bgm_epic', name: '🎵 BGM Epic', instruction: 'Orchestral, dramatic drums, powerful brass. Epic soundtrack.' },
            { id: 'block_ambient', name: '🔊 Ambient', instruction: 'Ambient sounds: wind, rain, city noise, nature sounds.' },
            { id: 'block_silence', name: '🔇 Silence', instruction: 'No background music. Only dialogue and essential sounds.' },
            { id: 'block_lofi', name: '🎧 Lo-fi/Chill', instruction: 'Lo-fi hip hop beats, relaxing chill music.' },
            { id: 'block_rock', name: '🎸 Rock/Action', instruction: 'Rock music, electric guitars, energetic drums.' },
        ]
    },
    {
        id: 'default_camera',
        name: '📹 กล้อง',
        icon: '📹',
        isDefault: true,
        blocks: [
            { id: 'block_closeup', name: '👤 Close-up', instruction: 'Close-up shots focusing on face and expressions.' },
            { id: 'block_wide', name: '🏞️ Wide Shot', instruction: 'Wide establishing shots showing full scene and environment.' },
            { id: 'block_pov', name: '👁️ POV/First Person', instruction: 'First person point of view, seeing through character eyes.' },
            { id: 'block_drone', name: '🚁 Drone/Aerial', instruction: 'Aerial drone shots, bird eye view, sweeping landscapes.' },
            { id: 'block_slowmo', name: '⏱️ Slow Motion', instruction: 'Slow motion for dramatic moments and action scenes.' },
            { id: 'block_timelapse', name: '⏰ Time-lapse', instruction: 'Time-lapse showing passage of time, clouds moving, sun setting.' },
        ]
    }
];

// === CATEGORIES (ตรงกับ ModeCreator) ===
const CATEGORIES = [
    "Cinematic / Movie",
    "Short Film / Story",
    "Product Showcase / Commercial",
    "Real Estate / Architecture",
    "Vlog / Lifestyle",
    "Time-lapse / Hyper-lapse",
    "Documentary / News",
    "How-to / Tutorial",
    "Relaxation / Lo-fi / ASMR"
];

const ExpanderCreator = () => {
    const [user, setUser] = useState(null);
    const messagesEndRef = useRef(null);
    
    // Expander State
    const [expanderName, setExpanderName] = useState('');
    const [expanderDescription, setExpanderDescription] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Cinematic / Movie');
    const [selectedBlocks, setSelectedBlocks] = useState([]);
    const [customBlocks, setCustomBlocks] = useState([]);
    const [expandedCategories, setExpandedCategories] = useState({ language: true, style: true, lighting: true, audio: true });
    
    // Custom Groups State
    const [customGroups, setCustomGroups] = useState([]);
    const [showAddGroupModal, setShowAddGroupModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupIcon, setNewGroupIcon] = useState('📌');
    const [showMoveBlockModal, setShowMoveBlockModal] = useState(false);
    const [blockToMove, setBlockToMove] = useState(null);
    const [showConfirmMoveModal, setShowConfirmMoveModal] = useState(false);
    const [selectedTargetGroup, setSelectedTargetGroup] = useState(null);
    const [openDropdownId, setOpenDropdownId] = useState(null); // ควบคุม Dropdown ให้เปิดได้ทีละ 1 อัน
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 }); // ตำแหน่ง Dropdown
    
    // Drag reorder state
    const [draggedBlockIndex, setDraggedBlockIndex] = useState(null);
    
    // Thumbnail State
    const [thumbnailFile, setThumbnailFile] = useState(null);
    const [thumbnailPreview, setThumbnailPreview] = useState('');
    const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
    const thumbnailInputRef = useRef(null);
    
    // AI Chat State (Floating)
    const [showAIChat, setShowAIChat] = useState(false);
    const [chatMessages, setChatMessages] = useState([
        { role: 'assistant', content: 'สวัสดีครับ! ผมช่วยสร้างกล่อง (Block) ใหม่ให้คุณได้ บอกมาได้เลยว่าอยากได้กล่องแบบไหน เช่น "อยากได้กล่องที่ทำให้ตัวละครพูดแบบโบราณ"' }
    ]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    
    // UI State
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testPrompt, setTestPrompt] = useState('บาสและออยลี่นั่งคุยกันที่ร้านกาแฟ');
    const [testResult, setTestResult] = useState('');
    const [copied, setCopied] = useState(false);
    const [savedExpanders, setSavedExpanders] = useState([]);
    const [editingExpander, setEditingExpander] = useState(null);
    
    // Tab & Sell State
    const [activeTab, setActiveTab] = useState('myExpander'); // 'creator' | 'myExpander' - default เป็น myExpander
    const [showSellModal, setShowSellModal] = useState(false);
    const [sellExpander, setSellExpander] = useState(null);
    const [sellPrice, setSellPrice] = useState(10);
    const [allowTrial, setAllowTrial] = useState(true);
    const [trialDays, setTrialDays] = useState(3);
    const [trialFee, setTrialFee] = useState(0);
    const [publishing, setPublishing] = useState(false);
    
    // Block Detail Modal State
    const [showBlockDetail, setShowBlockDetail] = useState(false);
    const [selectedBlockDetail, setSelectedBlockDetail] = useState(null);
    const [speakingBlock, setSpeakingBlock] = useState(false);
    const [thaiDescription, setThaiDescription] = useState('');
    const [loadingTranslation, setLoadingTranslation] = useState(false);
    
    // Cancel Trial Modal State
    const [showCancelTrialModal, setShowCancelTrialModal] = useState(null); // expander to cancel
    
    // FREE Publish Modal State
    const [showFreeModal, setShowFreeModal] = useState(null); // expander to publish free
    const [freeDays, setFreeDays] = useState(3);
    const [publishingFree, setPublishingFree] = useState(false);
    
    // Video URLs State - สำหรับตัวอย่างวีดีโอ
    const [videoUrls, setVideoUrls] = useState([]);
    const [newVideoUrl, setNewVideoUrl] = useState('');
    const [originalBlocksHash, setOriginalBlocksHash] = useState(''); // เก็บ hash ของ blocks เดิม
    const [openVideoMenu, setOpenVideoMenu] = useState(null); // ID ของ expander ที่เปิด video menu อยู่
    // เก็บค่าเดิมของ ชื่อ/Category/คำอธิบาย เพื่อตรวจสอบการเปลี่ยนแปลง
    const [originalName, setOriginalName] = useState('');
    const [originalCategory, setOriginalCategory] = useState('');
    const [originalDescription, setOriginalDescription] = useState('');
    
    // Auth listener
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(setUser);
        return () => unsubscribe();
    }, []);
    
    // คลิกพื้นที่ว่าง → ปิด Dropdown
    useEffect(() => {
        const handleClickOutside = () => {
            setOpenDropdownId(null);
            setOpenVideoMenu(null);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);
    
    // Load saved expanders, custom blocks, and custom groups
    useEffect(() => {
        if (user) {
            loadExpanders();
            loadCustomBlocks();
            loadCustomGroups();
        }
    }, [user]);
    
    const loadExpanders = async () => {
        if (!user) return;
        try {
            const q = query(collection(db, 'users', user.uid, 'expanders'));
            const snapshot = await getDocs(q);
            const now = new Date();
            
            const expanders = [];
            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                
                // ตรวจสอบ Trial Expander ที่หมดอายุ
                if (data.isTrial && data.trialExpiresAt) {
                    const expiresAt = data.trialExpiresAt.seconds 
                        ? new Date(data.trialExpiresAt.seconds * 1000) 
                        : new Date(data.trialExpiresAt);
                    
                    // ถ้าหมดอายุแล้ว → ลบออกจาก Firebase
                    if (expiresAt < now) {
                        await deleteDoc(doc(db, 'users', user.uid, 'expanders', docSnap.id));
                        console.log(`🗑️ ลบ Trial Expander "${data.name}" ที่หมดอายุแล้ว`);
                        continue; // ข้าม expander นี้
                    }
                }
                
                expanders.push({ id: docSnap.id, ...data });
            }
            
            setSavedExpanders(expanders);
        } catch (error) {
            console.error('Error loading expanders:', error);
        }
    };
    
    // === CUSTOM BLOCKS PERSISTENCE ===
    const loadCustomBlocks = async () => {
        if (!user) return;
        try {
            const q = query(collection(db, 'users', user.uid, 'customBlocks'));
            const snapshot = await getDocs(q);
            const blocks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isCustom: true }));
            setCustomBlocks(blocks);
        } catch (error) {
            console.error('Error loading custom blocks:', error);
        }
    };
    
    // === VIDEO URL HELPERS ===
    // สร้าง hash จาก blocks เพื่อตรวจสอบการเปลี่ยนแปลง
    const generateBlocksHash = (blocks) => {
        if (!blocks || blocks.length === 0) return '';
        return blocks.map(b => b.id).sort().join('|');
    };
    
    // เพิ่ม Video URL
    const handleAddVideoUrl = () => {
        if (!newVideoUrl.trim()) {
            alert('กรุณาใส่ URL วีดีโอ');
            return;
        }
        // ตรวจสอบ URL format
        try {
            new URL(newVideoUrl);
        } catch {
            alert('URL ไม่ถูกต้อง');
            return;
        }
        // ตรวจสอบซ้ำใน list
        if (videoUrls.includes(newVideoUrl.trim())) {
            alert('URL นี้มีอยู่แล้ว');
            return;
        }
        setVideoUrls(prev => [...prev, newVideoUrl.trim()]);
        setNewVideoUrl('');
    };
    
    // ลบ Video URL
    const handleRemoveVideoUrl = (urlToRemove) => {
        setVideoUrls(prev => prev.filter(url => url !== urlToRemove));
    };
    
    // ตรวจสอบว่า blocks เปลี่ยนแปลงหรือไม่ (เพิ่ม/ลบ)
    const checkBlocksChanged = (newBlocks) => {
        if (!originalBlocksHash) return false;
        const newHash = generateBlocksHash(newBlocks);
        return newHash !== originalBlocksHash;
    };

    const saveCustomBlock = async (block) => {
        if (!user) return null;
        try {
            const docRef = await addDoc(collection(db, 'users', user.uid, 'customBlocks'), {
                ...block,
                createdAt: serverTimestamp()
            });
            return docRef.id;
        } catch (error) {
            console.error('Error saving custom block:', error);
            return null;
        }
    };
    
    const deleteCustomBlock = async (blockId) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, 'users', user.uid, 'customBlocks', blockId));
            setCustomBlocks(prev => prev.filter(b => b.id !== blockId));
        } catch (error) {
            console.error('Error deleting custom block:', error);
        }
    };
    
    // === CUSTOM GROUPS PERSISTENCE ===
    const loadCustomGroups = async () => {
        if (!user) return;
        try {
            const q = query(collection(db, 'users', user.uid, 'customGroups'));
            const snapshot = await getDocs(q);
            const userGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // ถ้ายังไม่มี Groups เลย → สร้าง Default Groups ใน Firebase
            if (userGroups.length === 0) {
                console.log('Creating default groups for new user...');
                const createdGroups = [];
                
                for (const defaultGroup of DEFAULT_GROUPS) {
                    const groupData = {
                        name: defaultGroup.name,
                        icon: defaultGroup.icon,
                        blocks: defaultGroup.blocks,
                        isDefault: true,
                        createdAt: serverTimestamp()
                    };
                    const docRef = await addDoc(collection(db, 'users', user.uid, 'customGroups'), groupData);
                    createdGroups.push({ ...groupData, id: docRef.id });
                }
                
                setCustomGroups(createdGroups);
                console.log('Default groups created successfully!');
            } else {
                // มี Groups แล้ว → ใช้จาก Firebase
                setCustomGroups(userGroups);
            }
        } catch (error) {
            console.error('Error loading custom groups:', error);
            // ถ้า error ให้แสดง DEFAULT_GROUPS อย่างน้อย (ไม่บันทึก)
            setCustomGroups([...DEFAULT_GROUPS]);
        }
    };
    
    const saveCustomGroup = async (group) => {
        if (!user) return null;
        try {
            const docRef = await addDoc(collection(db, 'users', user.uid, 'customGroups'), {
                ...group,
                createdAt: serverTimestamp()
            });
            return docRef.id;
        } catch (error) {
            console.error('Error saving custom group:', error);
            return null;
        }
    };
    
    const handleAddGroup = async () => {
        if (!newGroupName.trim()) return;
        const newGroup = {
            name: `${newGroupIcon} ${newGroupName}`,
            icon: newGroupIcon,
            blocks: []
        };
        const savedId = await saveCustomGroup(newGroup);
        if (savedId) {
            setCustomGroups(prev => [...prev, { ...newGroup, id: savedId }]);
            setNewGroupName('');
            setNewGroupIcon('📌');
            setShowAddGroupModal(false);
        }
    };
    
    const deleteCustomGroup = async (groupId) => {
        if (!user || !confirm('ต้องการลบ Group นี้?')) return;
        try {
            await deleteDoc(doc(db, 'users', user.uid, 'customGroups', groupId));
            setCustomGroups(prev => prev.filter(g => g.id !== groupId));
        } catch (error) {
            console.error('Error deleting custom group:', error);
        }
    };
    
    // === MOVE BLOCK TO GROUP ===
    const openMoveBlockModal = (block, fromGroupId = null) => {
        setBlockToMove({ ...block, fromGroupId });
        setShowMoveBlockModal(true);
    };
    
    // เลือก Group เป้าหมาย → แสดง Confirm Popup
    const selectTargetGroup = (group) => {
        setSelectedTargetGroup(group);
        setShowConfirmMoveModal(true);
    };
    
    // ยืนยันการย้าย Block
    const confirmMoveBlock = async () => {
        if (!blockToMove || !selectedTargetGroup) return;
        
        const targetGroup = selectedTargetGroup;
        let localCustomGroups = [...customGroups];
        
        // ลบ Block จาก Group เดิม (ถ้ามี)
        if (blockToMove.fromGroupId) {
            const oldGroupIndex = localCustomGroups.findIndex(g => g.id === blockToMove.fromGroupId);
            if (oldGroupIndex !== -1) {
                const oldGroup = localCustomGroups[oldGroupIndex];
                const updatedOldBlocks = (oldGroup.blocks || []).filter(b => b.id !== blockToMove.id);
                
                // บันทึก Firestore (ทุก Group อยู่ใน Firebase แล้ว)
                if (user) {
                    await updateDoc(doc(db, 'users', user.uid, 'customGroups', blockToMove.fromGroupId), {
                        blocks: updatedOldBlocks
                    });
                }
                
                localCustomGroups[oldGroupIndex] = { ...oldGroup, blocks: updatedOldBlocks };
            }
        }
        
        // เพิ่ม Block เข้า Group เป้าหมาย
        const blockToSave = { ...blockToMove };
        delete blockToSave.fromGroupId;
        delete blockToSave.isCustom;
        
        const targetGroupIndex = localCustomGroups.findIndex(g => g.id === targetGroup.id);
        const currentBlocks = targetGroupIndex !== -1 ? (localCustomGroups[targetGroupIndex].blocks || []) : [];
        const updatedBlocks = [...currentBlocks, blockToSave];
        
        // บันทึก Firestore (ทุก Group อยู่ใน Firebase แล้ว)
        if (user) {
            await updateDoc(doc(db, 'users', user.uid, 'customGroups', targetGroup.id), {
                blocks: updatedBlocks
            });
        }
        
        if (targetGroupIndex !== -1) {
            localCustomGroups[targetGroupIndex] = { ...localCustomGroups[targetGroupIndex], blocks: updatedBlocks };
        }
        
        // อัปเดต state
        setCustomGroups(localCustomGroups);
        
        // ลบ Block จาก customBlocks (ถ้ามาจาก customBlocks)
        if (blockToMove.isCustom && !blockToMove.fromGroupId && user) {
            await deleteDoc(doc(db, 'users', user.uid, 'customBlocks', blockToMove.id));
            setCustomBlocks(prev => prev.filter(b => b.id !== blockToMove.id));
        }
        
        // ปิด Modal ทั้งหมด
        setShowConfirmMoveModal(false);
        setShowMoveBlockModal(false);
        setBlockToMove(null);
        setSelectedTargetGroup(null);
    };
    
    // === DELETE BLOCK FROM GROUP ===
    const deleteBlockFromGroup = async (groupId, blockId) => {
        const group = customGroups.find(g => g.id === groupId);
        if (!group) return;
        
        const updatedBlocks = (group.blocks || []).filter(b => b.id !== blockId);
        
        // บันทึกลง Firestore ทุก Group (ทุก Group อยู่ใน Firebase แล้ว)
        if (user) {
            await updateDoc(doc(db, 'users', user.uid, 'customGroups', groupId), {
                blocks: updatedBlocks
            });
        }
        setCustomGroups(prev => prev.map(g => 
            g.id === groupId ? { ...g, blocks: updatedBlocks } : g
        ));
    };
    
    // === EDIT BLOCK NAME ===
    const handleEditBlockName = async (groupId, blockId, newName) => {
        const group = customGroups.find(g => g.id === groupId);
        if (!group) return;
        
        const updatedBlocks = (group.blocks || []).map(b => 
            b.id === blockId ? { ...b, name: newName } : b
        );
        
        if (user) {
            await updateDoc(doc(db, 'users', user.uid, 'customGroups', groupId), {
                blocks: updatedBlocks
            });
        }
        setCustomGroups(prev => prev.map(g => 
            g.id === groupId ? { ...g, blocks: updatedBlocks } : g
        ));
    };
    
    // === DRAG REORDER FOR SELECTED BLOCKS ===
    const handleBlockDragStart = (e, index) => {
        setDraggedBlockIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };
    
    const handleBlockDragOver = (e, index) => {
        e.preventDefault();
        if (draggedBlockIndex === null || draggedBlockIndex === index) return;
        
        const newBlocks = [...selectedBlocks];
        const draggedBlock = newBlocks[draggedBlockIndex];
        newBlocks.splice(draggedBlockIndex, 1);
        newBlocks.splice(index, 0, draggedBlock);
        
        setSelectedBlocks(newBlocks);
        setDraggedBlockIndex(index);
    };
    
    const handleBlockDragEnd = () => {
        setDraggedBlockIndex(null);
    };
    
    const moveBlockUp = (index) => {
        if (index === 0) return;
        const newBlocks = [...selectedBlocks];
        [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
        setSelectedBlocks(newBlocks);
    };
    
    const moveBlockDown = (index) => {
        if (index === selectedBlocks.length - 1) return;
        const newBlocks = [...selectedBlocks];
        [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
        setSelectedBlocks(newBlocks);
    };
    
    // === BLOCK DETAIL & TTS ===
    const openBlockDetail = async (block) => {
        setSelectedBlockDetail(block);
        setThaiDescription('');
        setShowBlockDetail(true);
        setLoadingTranslation(true);
        
        try {
            // Call AI to translate and summarize in Thai
            const translateBlock = httpsCallable(functions, 'translateBlockToThai');
            const result = await translateBlock({ 
                blockName: block.name, 
                instruction: block.instruction 
            });
            setThaiDescription(result.data.thaiDescription);
        } catch (error) {
            console.error('Translation error:', error);
            // Fallback: Simple Thai description
            setThaiDescription(`กล่อง "${block.name}" - ${block.instruction}`);
        } finally {
            setLoadingTranslation(false);
        }
    };
    
    const speakBlockDescription = async () => {
        if (speakingBlock) {
            // Stop current audio if playing
            const existingAudio = document.getElementById('tts-audio');
            if (existingAudio) {
                existingAudio.pause();
                existingAudio.remove();
            }
            setSpeakingBlock(false);
            return;
        }
        
        if (!thaiDescription) return;
        
        setSpeakingBlock(true);
        try {
            // Call Google Cloud TTS via Cloud Function
            const textToSpeech = httpsCallable(functions, 'textToSpeechThai');
            const result = await textToSpeech({ text: thaiDescription });
            
            // Create audio element and play
            const audioData = `data:${result.data.mimeType};base64,${result.data.audioBase64}`;
            const audio = new Audio(audioData);
            audio.id = 'tts-audio';
            audio.onended = () => setSpeakingBlock(false);
            audio.onerror = () => setSpeakingBlock(false);
            audio.play();
        } catch (error) {
            console.error('TTS Error:', error);
            setSpeakingBlock(false);
        }
    };
    
    // === DRAG & DROP HANDLERS ===
    const handleDragStart = (e, block) => {
        e.dataTransfer.setData('block', JSON.stringify(block));
    };
    
    const handleDrop = (e) => {
        e.preventDefault();
        const blockData = e.dataTransfer.getData('block');
        if (blockData) {
            const block = JSON.parse(blockData);
            // Check if already added
            if (!selectedBlocks.find(b => b.id === block.id)) {
                // Check language conflict
                if (block.type === 'language') {
                    const hasOtherLanguage = selectedBlocks.find(b => b.type === 'language');
                    if (hasOtherLanguage) {
                        alert('⚠️ เลือกได้เพียงภาษาเดียว! กรุณาลบภาษาเดิมก่อน');
                        return;
                    }
                }
                setSelectedBlocks([...selectedBlocks, { ...block, order: selectedBlocks.length }]);
            }
        }
    };
    
    const handleDragOver = (e) => {
        e.preventDefault();
    };
    
    const removeBlock = (blockId) => {
        setSelectedBlocks(selectedBlocks.filter(b => b.id !== blockId));
    };
    
    // === THUMBNAIL HANDLER ===
    const handleThumbnailChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Validate file type
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            alert('กรุณาเลือกไฟล์ JPG, PNG หรือ WEBP เท่านั้น');
            return;
        }
        
        // Validate file size (3MB)
        if (file.size > 3 * 1024 * 1024) {
            alert('ไฟล์ต้องมีขนาดไม่เกิน 3MB');
            return;
        }
        
        setThumbnailFile(file);
        
        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setThumbnailPreview(reader.result);
        };
        reader.readAsDataURL(file);
    };
    
    const uploadThumbnail = async (expanderId) => {
        if (!thumbnailFile || !user) return null;
        
        try {
            setUploadingThumbnail(true);
            const fileExt = thumbnailFile.name.split('.').pop();
            const fileName = `expanders/${user.uid}/${expanderId}_${Date.now()}.${fileExt}`;
            const storageRef = ref(storage, fileName);
            
            await uploadBytes(storageRef, thumbnailFile);
            const downloadURL = await getDownloadURL(storageRef);
            return downloadURL;
        } catch (error) {
            console.error('Error uploading thumbnail:', error);
            return null;
        } finally {
            setUploadingThumbnail(false);
        }
    };
    
    const clearThumbnail = () => {
        setThumbnailFile(null);
        setThumbnailPreview('');
        if (thumbnailInputRef.current) {
            thumbnailInputRef.current.value = '';
        }
    };
    
    // === AI CHAT HANDLER ===
    const handleChatSend = async () => {
        if (!chatInput.trim() || chatLoading) return;
        
        const userMessage = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setChatLoading(true);
        
        try {
            const generateBlock = httpsCallable(functions, 'generateBlock');
            const result = await generateBlock({ message: userMessage });
            
            const newBlock = result.data;
            
            // ตรวจจับภาษาและเพิ่ม flag ธงชาติอัตโนมัติ
            const languageFlags = {
                'ไทย': 'th', 'thai': 'th', 'thailand': 'th',
                'อังกฤษ': 'gb', 'english': 'gb', 'uk': 'gb', 'british': 'gb',
                'ญี่ปุ่น': 'jp', 'japanese': 'jp', 'japan': 'jp',
                'เกาหลี': 'kr', 'korean': 'kr', 'korea': 'kr',
                'จีน': 'cn', 'chinese': 'cn', 'china': 'cn', 'mandarin': 'cn',
                'ลาว': 'la', 'lao': 'la', 'laos': 'la',
                'เวียดนาม': 'vn', 'vietnamese': 'vn', 'vietnam': 'vn',
                'พม่า': 'mm', 'myanmar': 'mm', 'burmese': 'mm',
                'กัมพูชา': 'kh', 'cambodian': 'kh', 'khmer': 'kh', 'cambodia': 'kh',
                'มาเลเซีย': 'my', 'malay': 'my', 'malaysia': 'my',
                'อินโดนีเซีย': 'id', 'indonesian': 'id', 'indonesia': 'id',
                'ฟิลิปปินส์': 'ph', 'filipino': 'ph', 'philippines': 'ph', 'tagalog': 'ph',
                'อินเดีย': 'in', 'hindi': 'in', 'india': 'in',
                'ฝรั่งเศส': 'fr', 'french': 'fr', 'france': 'fr',
                'เยอรมัน': 'de', 'german': 'de', 'germany': 'de',
                'สเปน': 'es', 'spanish': 'es', 'spain': 'es',
                'อิตาลี': 'it', 'italian': 'it', 'italy': 'it',
                'โปรตุเกส': 'pt', 'portuguese': 'pt', 'portugal': 'pt',
                'รัสเซีย': 'ru', 'russian': 'ru', 'russia': 'ru',
                'อาหรับ': 'sa', 'arabic': 'sa', 'arab': 'sa',
            };
            
            // หา flag จากชื่อ block
            let detectedFlag = null;
            const blockNameLower = (newBlock.name || '').toLowerCase();
            for (const [keyword, flag] of Object.entries(languageFlags)) {
                if (blockNameLower.includes(keyword.toLowerCase())) {
                    detectedFlag = flag;
                    break;
                }
            }
            
            // Save to Firestore and get ID
            const blockData = {
                ...newBlock,
                isCustom: true,
                type: 'custom',
                ...(detectedFlag && { flag: detectedFlag })
            };
            
            const savedId = await saveCustomBlock(blockData);
            
            if (savedId) {
                // Add to state with Firestore ID
                const blockWithId = {
                    ...blockData,
                    id: savedId
                };
                setCustomBlocks(prev => [...prev, blockWithId]);
                
                setChatMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: `สร้างกล่อง "${newBlock.name}" ให้แล้ว! 🎉\n\nกล่องถูกบันทึกแล้ว ลากไปวางใน Expander ได้เลยครับ`
                }]);
            } else {
                throw new Error('Failed to save block');
            }
        } catch (error) {
            console.error('Error generating block:', error);
            setChatMessages(prev => [...prev, { 
                role: 'assistant', 
                content: 'ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้งครับ'
            }]);
        } finally {
            setChatLoading(false);
        }
    };
    
    // === SAVE EXPANDER ===
    const handleSave = async () => {
        if (!user) {
            alert('กรุณาเข้าสู่ระบบก่อน');
            return;
        }
        if (!expanderName.trim()) {
            alert('กรุณาใส่ชื่อ Expander');
            return;
        }
        if (selectedBlocks.length === 0) {
            alert('กรุณาเพิ่มอย่างน้อย 1 กล่อง');
            return;
        }
        
        setSaving(true);
        try {
            // ตรวจสอบว่า blocks หรือ ชื่อ/Category/คำอธิบาย เปลี่ยนแปลงหรือไม่ - ถ้าเปลี่ยน ลบ videoUrls
            let finalVideoUrls = videoUrls;
            const blocksChanged = editingExpander && checkBlocksChanged(selectedBlocks);
            const nameChanged = editingExpander && expanderName !== originalName;
            const categoryChanged = editingExpander && selectedCategory !== originalCategory;
            const descriptionChanged = editingExpander && expanderDescription !== originalDescription;
            
            if (blocksChanged || nameChanged || categoryChanged || descriptionChanged) {
                finalVideoUrls = []; // ลบ URL ทั้งหมดเมื่อมีการเปลี่ยนแปลง
                setVideoUrls([]);
                const changedFields = [];
                if (blocksChanged) changedFields.push('Blocks');
                if (nameChanged) changedFields.push('ชื่อ');
                if (categoryChanged) changedFields.push('Category');
                if (descriptionChanged) changedFields.push('คำอธิบาย');
                console.log(`⚠️ ${changedFields.join(', ')} changed - Video URLs cleared`);
            }
            
            const expanderData = {
                name: expanderName,
                description: expanderDescription,
                categoryId: selectedCategory,
                blocks: selectedBlocks,
                customBlocks: customBlocks.filter(cb => selectedBlocks.find(sb => sb.id === cb.id)),
                videoUrls: finalVideoUrls, // เพิ่ม videoUrls
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            
            let docRef;
            if (editingExpander) {
                // Upload thumbnail if new file selected
                if (thumbnailFile) {
                    const thumbnailUrl = await uploadThumbnail(editingExpander.id);
                    if (thumbnailUrl) {
                        expanderData.thumbnail = thumbnailUrl;
                    }
                } else if (thumbnailPreview) {
                    // Keep existing thumbnail
                    expanderData.thumbnail = thumbnailPreview;
                }
                await updateDoc(doc(db, 'users', user.uid, 'expanders', editingExpander.id), expanderData);
            } else {
                // Create new expander first to get ID
                docRef = await addDoc(collection(db, 'users', user.uid, 'expanders'), expanderData);
                
                // Upload thumbnail if selected
                if (thumbnailFile) {
                    const thumbnailUrl = await uploadThumbnail(docRef.id);
                    if (thumbnailUrl) {
                        await updateDoc(docRef, { thumbnail: thumbnailUrl });
                    }
                }
            }
            
            await loadExpanders();
            alert('บันทึก Expander สำเร็จ! ✅');
            
            // Reset form
            setExpanderName('');
            setExpanderDescription('');
            setSelectedBlocks([]);
            setEditingExpander(null);
            clearThumbnail();
            setVideoUrls([]);
            setOriginalBlocksHash('');
            setNewVideoUrl('');
        } catch (error) {
            console.error('Error saving expander:', error);
            alert('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setSaving(false);
        }
    };
    
    // === TEST EXPANDER ===
    const handleTest = async () => {
        if (selectedBlocks.length === 0) {
            alert('กรุณาเพิ่มอย่างน้อย 1 กล่อง');
            return;
        }
        if (!testPrompt.trim()) {
            alert('กรุณาใส่ Prompt ทดสอบ');
            return;
        }
        
        setTesting(true);
        setTestResult('');
        
        try {
            const expandPrompt = httpsCallable(functions, 'expandPrompt');
            const result = await expandPrompt({
                simplePrompt: testPrompt,
                blocks: selectedBlocks
            });
            
            setTestResult(result.data.expandedPrompt);
        } catch (error) {
            console.error('Error testing expander:', error);
            setTestResult('เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            setTesting(false);
        }
    };
    
    // === LOAD EXPANDER FOR EDIT ===
    const loadExpanderForEdit = (expander) => {
        setEditingExpander(expander);
        setExpanderName(expander.name);
        setExpanderDescription(expander.description || '');
        setSelectedCategory(expander.categoryId);
        setSelectedBlocks(expander.blocks || []);
        if (expander.customBlocks) {
            setCustomBlocks(prev => [...prev, ...expander.customBlocks]);
        }
        // Load thumbnail
        if (expander.thumbnail) {
            setThumbnailPreview(expander.thumbnail);
        } else {
            clearThumbnail();
        }
        // Load video URLs และเก็บ hash ของ blocks เดิม
        setVideoUrls(expander.videoUrls || []);
        setOriginalBlocksHash(generateBlocksHash(expander.blocks || []));
        // เก็บค่าเดิมของ ชื่อ/Category/คำอธิบาย
        setOriginalName(expander.name);
        setOriginalCategory(expander.categoryId);
        setOriginalDescription(expander.description || '');
    };
    
    // === DELETE EXPANDER ===
    const handleDeleteExpander = async (expanderId) => {
        if (!confirm('ต้องการลบ Expander นี้?')) return;
        
        try {
            await deleteDoc(doc(db, 'users', user.uid, 'expanders', expanderId));
            await loadExpanders();
        } catch (error) {
            console.error('Error deleting expander:', error);
        }
    };
    
    // === CANCEL TRIAL ===
    const handleCancelTrial = async (expander) => {
        try {
            // 1. ลบ Expander จาก My Expander
            await deleteDoc(doc(db, 'users', user.uid, 'expanders', expander.id));
            
            // 2. ลบ trialHistory เพื่อให้ Marketplace ไม่แสดง "กำลังทดลองใช้"
            await deleteDoc(doc(db, 'users', user.uid, 'trialHistory', expander.originalExpanderId));
            
            // 3. บันทึกว่าเคยทดลองแล้ว (ห้ามทดลองซ้ำ)
            await setDoc(doc(db, 'users', user.uid, 'canceledTrials', expander.originalExpanderId), {
                expanderName: expander.name,
                canceledAt: serverTimestamp(),
                originalExpanderId: expander.originalExpanderId,
                sellerId: expander.trialFromSellerId
            });
            
            await loadExpanders();
            setShowCancelTrialModal(null);
            alert('✅ ยกเลิกการทดลองใช้งานสำเร็จ\n\nรีเฟรชหน้า Marketplace เพื่อดูสถานะใหม่');
        } catch (error) {
            console.error('Error canceling trial:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        }
    };
    
    // === PUBLISH TO MARKETPLACE ===
    const handlePublishToMarketplace = async () => {
        if (!sellExpander || !user) return;
        
        setPublishing(true);
        try {
            // Calculate platform fee (10%)
            const platformFee = Math.floor(sellPrice * 0.10);
            const sellerReceives = sellPrice - platformFee;
            
            // Add to global marketplace collection
            await addDoc(collection(db, 'marketplace_expanders'), {
                ...sellExpander,
                originalId: sellExpander.id,
                originalCreatorId: user.uid,
                sellerId: user.uid,
                sellerName: user.displayName || user.email,
                price: sellPrice,
                platformFee: platformFee,
                sellerReceives: sellerReceives,
                // Video URLs - ตัวอย่างวีดีโอ
                videoUrls: sellExpander.videoUrls || [],
                // Trial settings
                allowTrial: allowTrial,
                trialDays: allowTrial ? trialDays : 0,
                trialFee: allowTrial ? trialFee : 0,
                // Stats
                status: 'active',
                downloads: 0,
                rating: 0,
                reviews: 0,
                publishedAt: serverTimestamp()
            });
            
            // Update local expander to mark as published
            await updateDoc(doc(db, 'users', user.uid, 'expanders', sellExpander.id), {
                isPublished: true,
                marketplacePrice: sellPrice,
                trialDays: allowTrial ? trialDays : 0,
                trialFee: allowTrial ? trialFee : 0
            });
            
            // Record transaction to user's history
            await addDoc(collection(db, 'users', user.uid, 'transactions'), {
                type: 'publish_sale',
                itemName: sellExpander.name,
                coverImage: sellExpander.thumbnail || '',
                expanderId: sellExpander.id,
                price: sellPrice,
                date: serverTimestamp()
            });
            
            await loadExpanders();
            setShowSellModal(false);
            setSellExpander(null);
            setSellPrice(10);
            setAllowTrial(true);
            setTrialDays(3);
            setTrialFee(0);
            alert('🎉 เผยแพร่ไปยัง Marketplace สำเร็จ!');
        } catch (error) {
            console.error('Error publishing to marketplace:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            setPublishing(false);
        }
    };
    
    // === OPEN SELL MODAL ===
    const openSellModal = (expander) => {
        // ตรวจสอบว่ามี Video URL หรือไม่ (ต้องมีอย่างน้อย 1 URL ก่อนขาย)
        // เช็คจาก Firestore data (expander.videoUrls)
        const savedVideoUrls = expander.videoUrls || [];
        
        if (savedVideoUrls.length === 0) {
            alert('⚠️ กรุณาเพิ่ม URL ตัวอย่างวีดีโออย่างน้อย 1 ลิงก์ก่อนขาย\n\n1. กด "แก้ไข" → เพิ่ม URL ในส่วน "ตัวอย่างวีดีโอ"\n2. กด "บันทึก Expander" ก่อน\n3. แล้วค่อยกด "ขาย"');
            return;
        }
        
        setSellExpander(expander);
        setSellPrice(expander.marketplacePrice || 10);
        setAllowTrial(expander.trialDays > 0 || true);
        setTrialDays(expander.trialDays || 3);
        setTrialFee(expander.trialFee || 0);
        setShowSellModal(true);
    };
    
    // === CANCEL SALE ===
    const cancelSale = async (expander) => {
        if (!user || !expander) return;
        if (!confirm(`ยืนยันยกเลิกการขาย "${expander.name}"?`)) return;
        
        try {
            // Remove from marketplace - ใช้ originalId เพื่อหา doc
            const marketplaceQuery = query(
                collection(db, 'marketplace_expanders'),
                where('originalId', '==', expander.id),
                where('sellerId', '==', user.uid)
            );
            const marketplaceSnap = await getDocs(marketplaceQuery);
            for (const docSnap of marketplaceSnap.docs) {
                await deleteDoc(doc(db, 'marketplace_expanders', docSnap.id));
            }
            
            // Update local expander
            await updateDoc(doc(db, 'users', user.uid, 'expanders', expander.id), {
                isPublished: false,
                marketplacePrice: null
            });
            
            // Record transaction to user's history
            await addDoc(collection(db, 'users', user.uid, 'transactions'), {
                type: 'cancel_sale',
                itemName: expander.name,
                coverImage: expander.thumbnail || '',
                expanderId: expander.id,
                date: serverTimestamp()
            });
            
            await loadExpanders();
            alert('✅ ยกเลิกการขายสำเร็จ!');
        } catch (error) {
            console.error('Error canceling sale:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        }
    };
    
    // === PUBLISH FREE ===
    const handlePublishFree = async () => {
        if (!user || !showFreeModal) return;
        const expander = showFreeModal;
        
        setPublishingFree(true);
        try {
            const freeUntil = new Date();
            freeUntil.setDate(freeUntil.getDate() + freeDays);
            
            // Add to marketplace as FREE
            const marketplaceData = {
                originalId: expander.id,
                name: expander.name,
                description: expander.description || '',
                categoryId: expander.categoryId || selectedCategory,
                blocks: expander.blocks || [],
                thumbnail: expander.thumbnail || '',
                videoUrls: expander.videoUrls || [],
                sellerId: user.uid,
                sellerName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
                sellerEmail: user.email || '',
                price: 0,
                isFree: true,
                freeUntil: freeUntil,
                freeDays: freeDays,
                allowTrial: false,
                trialDays: 0,
                trialFee: 0,
                downloads: 0,
                rating: 0,
                ratingCount: 0,
                createdAt: serverTimestamp()
            };
            
            await addDoc(collection(db, 'marketplace_expanders'), marketplaceData);
            
            // Update local expander with free status
            await updateDoc(doc(db, 'users', user.uid, 'expanders', expander.id), {
                isPublishedFree: true,
                freeUntil: freeUntil,
                freeExpiresAt: freeUntil,
                freeDays: freeDays
            });
            
            // Record transaction to user's history
            await addDoc(collection(db, 'users', user.uid, 'transactions'), {
                type: 'publish_free',
                itemName: expander.name,
                coverImage: expander.thumbnail || '',
                expanderId: expander.id,
                freeDays: freeDays,
                date: serverTimestamp()
            });
            
            await loadExpanders();
            setShowFreeModal(null);
            setFreeDays(3);
            alert(`✅ เผยแพร่ฟรี ${freeDays} วันสำเร็จ!`);
        } catch (error) {
            console.error('Error publishing free:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            setPublishingFree(false);
        }
    };
    
    // === CANCEL FREE ===
    const cancelFree = async (expander) => {
        if (!user || !expander) return;
        if (!confirm(`ยืนยันยกเลิกการเผยแพร่ฟรี "${expander.name}"?`)) return;
        
        try {
            // Remove from marketplace
            const marketplaceQuery = query(
                collection(db, 'marketplace_expanders'),
                where('originalId', '==', expander.id),
                where('sellerId', '==', user.uid),
                where('isFree', '==', true)
            );
            const marketplaceSnap = await getDocs(marketplaceQuery);
            for (const docSnap of marketplaceSnap.docs) {
                await deleteDoc(doc(db, 'marketplace_expanders', docSnap.id));
            }
            
            // Update local expander
            await updateDoc(doc(db, 'users', user.uid, 'expanders', expander.id), {
                isPublishedFree: false,
                freeUntil: null,
                freeExpiresAt: null,
                freeDays: null
            });
            
            // Record transaction to user's history
            await addDoc(collection(db, 'users', user.uid, 'transactions'), {
                type: 'cancel_free',
                itemName: expander.name,
                coverImage: expander.thumbnail || '',
                expanderId: expander.id,
                date: serverTimestamp()
            });
            
            await loadExpanders();
            alert('✅ ยกเลิกการเผยแพร่ฟรีสำเร็จ!');
        } catch (error) {
            console.error('Error canceling free:', error);
            alert('เกิดข้อผิดพลาด: ' + error.message);
        }
    };
    
    // === COPY PROMPT ===
    const handleCopyPrompt = async () => {
        if (!testResult) return;
        try {
            await navigator.clipboard.writeText(testResult);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Copy failed:', error);
        }
    };
    
    // Toggle category expansion
    const toggleCategory = (catKey) => {
        setExpandedCategories(prev => ({ ...prev, [catKey]: !prev[catKey] }));
    };
    
    // Helper: ตรวจสอบว่า Expander ที่ได้มาฟรีถูกแก้ไข blocks หรือยัง
    const isModifiedFromOriginal = (exp) => {
        // ถ้าไม่ได้มาฟรี หรือไม่มี originalBlocks ให้ถือว่าแก้ไขแล้ว (สามารถขาย/แจกได้)
        if (!exp.receivedFree || !exp.originalBlocks) return true;
        const currentBlockIds = (exp.blocks || []).map(b => b.id).sort().join(',');
        const originalBlockIds = (exp.originalBlocks || []).map(b => b.id).sort().join(',');
        return currentBlockIds !== originalBlockIds;
    };
    
    // Helper: ตรวจสอบว่า Expander ได้มาฟรีและยังไม่ได้แก้ไข
    const isReceivedFreeUnmodified = (exp) => {
        return exp.receivedFree && exp.originalBlocks && !isModifiedFromOriginal(exp);
    };
    
    // Scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-red-900 via-slate-900 to-slate-950 p-6 relative">
            <div className="max-w-7xl mx-auto">
                {/* Header - Unified Style */}
                <div className="mb-8 relative bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
                    <div className="flex items-center gap-4 mb-4">
                        <div className="relative group">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30 group-hover:scale-110 transition-transform duration-300">
                                <Sparkles className="text-white group-hover:rotate-12 transition-transform duration-300" size={32} />
                            </div>
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900 flex items-center justify-center">
                                <span className="text-[8px] font-bold text-black">{savedExpanders.length}</span>
                            </div>
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-red-100 to-orange-200 tracking-tight">
                                Expander Creator
                            </h1>
                            <p className="text-base text-slate-400 font-light flex items-center gap-2 mt-1">
                                <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                                สร้าง Expander สำหรับขยาย Prompt ให้เป็น Premium Quality
                            </p>
                        </div>
                    </div>
                    
                    {/* Tab Navigation */}
                    <div className="inline-flex gap-2 bg-black/30 backdrop-blur-xl p-2 rounded-2xl border border-white/10">
                        <button
                            onClick={() => setActiveTab('myExpander')}
                            className={`group relative px-5 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${
                                activeTab === 'myExpander' 
                                    ? 'bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white shadow-lg shadow-red-500/40' 
                                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <Package size={18} className={`transition-transform duration-300 ${activeTab === 'myExpander' ? '' : 'group-hover:rotate-12'}`} /> My Expander
                            {savedExpanders.length > 0 && (
                                <span className="bg-amber-400 text-black px-2.5 py-0.5 rounded-full text-xs font-bold">{savedExpanders.length}</span>
                            )}
                            {activeTab === 'myExpander' && <span className="absolute inset-0 rounded-xl bg-white/10" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('creator')}
                            className={`group relative px-5 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${
                                activeTab === 'creator' 
                                    ? 'bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white shadow-lg shadow-red-500/40' 
                                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <Edit3 size={18} className={`transition-transform duration-300 ${activeTab === 'creator' ? '' : 'group-hover:rotate-12'}`} /> Creator
                            {activeTab === 'creator' && <span className="absolute inset-0 rounded-xl bg-white/10" />}
                        </button>
                    </div>
                </div>
                
                {/* === MY EXPANDER TAB === */}
                {activeTab === 'myExpander' && (
                    <div className="space-y-6">
                        {savedExpanders.length === 0 ? (
                            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-xl p-12 text-center">
                                <Package size={48} className="mx-auto text-slate-500 mb-4" />
                                <h3 className="text-xl font-bold text-white mb-2">ยังไม่มี Expander</h3>
                                <p className="text-slate-400 mb-4">สร้าง Expander แรกของคุณเพื่อเริ่มต้น</p>
                                <button
                                    onClick={() => setActiveTab('creator')}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium"
                                >
                                    ไปสร้าง Expander
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {/* Card สร้าง Expander ใหม่ */}
                                <button
                                    onClick={() => {
                                        setEditingExpander(null);
                                        setExpanderName('');
                                        setExpanderDescription('');
                                        setSelectedBlocks([]);
                                        setVideoUrls([]);
                                        setOriginalBlocksHash('');
                                        setNewVideoUrl('');
                                        clearThumbnail();
                                        setActiveTab('creator');
                                    }}
                                    className="bg-slate-800/50 border-2 border-dashed border-red-500/30 hover:border-red-500/60 rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(220,38,38,0.15)] flex flex-col items-center justify-center min-h-[320px] group"
                                >
                                    <div className="w-16 h-16 bg-red-600/20 group-hover:bg-red-600/40 rounded-full flex items-center justify-center mb-4 transition-all">
                                        <Plus size={32} className="text-red-400" />
                                    </div>
                                    <span className="text-slate-300 group-hover:text-white font-medium transition-colors">
                                        สร้าง Expander ใหม่
                                    </span>
                                </button>
                                
                                {savedExpanders.map(exp => (
                                    <div key={exp.id} className="bg-black/40 border border-white/10 rounded-2xl overflow-hidden group hover:border-red-500/50 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(220,38,38,0.15)] flex flex-col">
                                        {/* Card Image/Banner - ขนาดเท่า Marketplace (h-48) */}
                                        <div className="h-48 bg-gradient-to-br from-red-600/30 via-purple-600/30 to-orange-600/30 relative overflow-hidden">
                                            {exp.thumbnail ? (
                                                <img src={exp.thumbnail} alt={exp.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Sparkles size={40} className="text-white/30" />
                                                </div>
                                            )}
                                            {/* Blocks Preview - ธีมกระจก */}
                                            <div className="absolute bottom-2 left-2 flex gap-1 flex-wrap max-w-[90%]">
                                                {exp.blocks?.slice(0, 4).map((block, i) => (
                                                    <span key={i} className="bg-white/20 backdrop-blur-sm border border-white/20 px-2 py-0.5 rounded text-xs text-white">
                                                        {block.name?.split(' ')[0]}
                                                    </span>
                                                ))}
                                                {exp.blocks?.length > 4 && (
                                                    <span className="bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded text-xs text-white">
                                                        +{exp.blocks.length - 4}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Video Play Button - มุมซ้ายบน */}
                                            {exp.videoUrls?.length > 0 && (
                                                <div className="absolute top-2 left-2 z-20">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenVideoMenu(openVideoMenu === exp.id ? null : exp.id);
                                                        }}
                                                        className="bg-purple-500/80 backdrop-blur-md p-1.5 rounded-lg text-white border border-purple-400/30 shadow-xl hover:bg-purple-500 transition-all"
                                                        title="ดูตัวอย่างวีดีโอ"
                                                    >
                                                        <Play size={14} fill="currentColor" />
                                                    </button>
                                                    {/* Dropdown Video List */}
                                                    {openVideoMenu === exp.id && (
                                                        <div className="absolute top-full left-0 mt-2 bg-slate-900/95 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl p-2 min-w-[200px] z-50">
                                                            <p className="text-xs text-slate-400 px-2 pb-2 border-b border-white/10 mb-2">🎬 ตัวอย่างวีดีโอ ({exp.videoUrls.length})</p>
                                                            {exp.videoUrls.map((url, idx) => (
                                                                <a
                                                                    key={idx}
                                                                    href={url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-sm text-white transition-all group"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <Play size={14} className="text-purple-400 group-hover:text-purple-300" />
                                                                    <span className="flex-1 truncate">VDO {idx + 1}</span>
                                                                    <ExternalLink size={12} className="text-slate-500 group-hover:text-white" />
                                                                </a>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {/* Trial Badge */}
                                            {exp.isTrial && (
                                                <div className="absolute top-2 right-2 bg-blue-500 px-2 py-0.5 rounded text-xs text-white flex items-center gap-1">
                                                    🎁 ทดลองใช้
                                                </div>
                                            )}
                                            {/* Published Badge */}
                                            {exp.isPublished && !exp.isTrial && !exp.fromMarketplace && !exp.isPublishedFree && (
                                                <div className="absolute top-2 right-2 bg-green-500 px-2 py-0.5 rounded text-xs text-white flex items-center gap-1">
                                                    <Store size={10} /> On Sale
                                                </div>
                                            )}
                                            {/* FREE Published Badge - กำลังเผยแพร่ฟรีอยู่ + countdown */}
                                            {exp.isPublishedFree && !exp.isTrial && (
                                                <div className="absolute top-2 right-2 bg-gradient-to-r from-emerald-500 to-green-600 px-2 py-1 rounded-lg text-xs text-white flex items-center gap-1 font-bold shadow-lg">
                                                    🎁 เผยแพร่ฟรี {exp.freeDays || 3}D
                                                    {exp.freeExpiresAt && (
                                                        <span className="text-[10px] opacity-80">
                                                            ({(() => {
                                                                const expires = exp.freeExpiresAt?.seconds ? new Date(exp.freeExpiresAt.seconds * 1000) : new Date(exp.freeExpiresAt);
                                                                const now = new Date();
                                                                const diff = expires - now;
                                                                if (diff <= 0) return 'หมดเวลา';
                                                                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                                                                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                                                return `${days}D ${hours}H`;
                                                            })()})
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {/* FREE Badge - ได้มาฟรีจาก Marketplace (แสดงเฉพาะเมื่อยังไม่ได้แก้ไข) */}
                                            {isReceivedFreeUnmodified(exp) && !exp.isTrial && !exp.isPublishedFree && (
                                                <div className="absolute top-2 right-2 bg-purple-500 px-2 py-0.5 rounded text-xs text-white flex items-center gap-1">
                                                    🎁 FREE
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Card Content */}
                                        <div className="p-4">
                                            <h3 className="text-lg font-bold text-white mb-1">{exp.name}</h3>
                                            <p className="text-sm text-slate-400 mb-2 line-clamp-2">
                                                {exp.description || 'ไม่มีคำอธิบาย'}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 mb-4 flex-wrap">
                                                <span className="bg-white/10 px-2 py-0.5 rounded">{exp.categoryId}</span>
                                                <span>{exp.blocks?.length || 0} blocks</span>
                                                {/* Video URLs Count */}
                                                {exp.videoUrls?.length > 0 && (
                                                    <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded flex items-center gap-1">
                                                        🎬 {exp.videoUrls.length} VDO
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {/* Action Buttons */}
                                            <div className="flex gap-2 relative group/trial">
                                                {exp.isTrial ? (
                                                    /* Trial Expander - แสดงวันหมดอายุ ห้ามแก้ไข */
                                                    <>
                                                        {/* ปกติ: แสดงข้อมูล Trial */}
                                                        <div className="flex-1 px-3 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium flex items-center justify-center gap-1 group-hover/trial:hidden">
                                                            🔒 ทดลองใช้ (จาก {exp.trialFromSellerName || 'ผู้ขาย'})
                                                        </div>
                                                        <div className="px-3 py-2 bg-slate-700/50 text-slate-400 rounded-lg text-xs flex items-center gap-1 group-hover/trial:hidden">
                                                            ⏳ {exp.trialExpiresAt ? new Date(exp.trialExpiresAt.seconds ? exp.trialExpiresAt.seconds * 1000 : exp.trialExpiresAt).toLocaleDateString('th-TH') : 'N/A'}
                                                        </div>
                                                        
                                                        {/* Hover: แสดงปุ่มยกเลิก */}
                                                        <button
                                                            onClick={() => setShowCancelTrialModal(exp)}
                                                            className="hidden group-hover/trial:flex flex-1 px-3 py-2 bg-red-500/20 backdrop-blur-sm border border-red-500/30 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium items-center justify-center gap-1 transition-all"
                                                        >
                                                            <Trash2 size={14} /> ยกเลิกทดลองใช้งาน
                                                        </button>
                                                    </>
                                                ) : exp.isPublishedFree ? (
                                                    /* FREE Published Expander - แสดงสถานะฟรีและปุ่มยกเลิก */
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                loadExpanderForEdit(exp);
                                                                setActiveTab('creator');
                                                            }}
                                                            className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1"
                                                        >
                                                            <Edit3 size={14} /> แก้ไข
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteExpander(exp.id)}
                                                            className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => cancelFree(exp)}
                                                            className="px-3 py-2 bg-emerald-500/20 hover:bg-red-500/30 text-emerald-400 hover:text-red-400 rounded-lg flex items-center gap-1 text-sm transition-all group"
                                                            title="คลิกเพื่อยกเลิกเผยแพร่ฟรี"
                                                        >
                                                            <Package size={14} className="group-hover:hidden" />
                                                            <X size={14} className="hidden group-hover:block" />
                                                            <span className="group-hover:hidden">FREE {exp.freeDays}D</span>
                                                            <span className="hidden group-hover:block">ยกเลิก</span>
                                                        </button>
                                                    </>
                                                ) : isReceivedFreeUnmodified(exp) ? (
                                                    /* Expander ที่ได้มาฟรีและยังไม่ได้แก้ไข - ไม่แสดงปุ่ม FREE/ขาย */
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                loadExpanderForEdit(exp);
                                                                setActiveTab('creator');
                                                            }}
                                                            className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1"
                                                        >
                                                            <Edit3 size={14} /> แก้ไข
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteExpander(exp.id)}
                                                            className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    /* Normal Expander หรือ Expander จาก Marketplace ที่แก้ไขแล้ว - แสดงปุ่มแก้ไข/ลบ/ฟรี/ขาย */
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                loadExpanderForEdit(exp);
                                                                setActiveTab('creator');
                                                            }}
                                                            className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1"
                                                        >
                                                            <Edit3 size={14} /> แก้ไข
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteExpander(exp.id)}
                                                            className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                        {/* ปุ่ม FREE - เผยแพร่ฟรี */}
                                                        {!exp.isPublished && (
                                                            <button
                                                                onClick={() => setShowFreeModal(exp)}
                                                                className="px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg flex items-center gap-1"
                                                            >
                                                                <Package size={14} /> FREE
                                                            </button>
                                                        )}
                                                        {!exp.isPublished ? (
                                                            <button
                                                                onClick={() => openSellModal(exp)}
                                                                className="px-3 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg flex items-center gap-1"
                                                            >
                                                                <Store size={14} /> ขาย
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => cancelSale(exp)}
                                                                className="px-3 py-2 bg-green-500/20 hover:bg-red-500/30 text-green-400 hover:text-red-400 rounded-lg flex items-center gap-1 text-sm transition-all group"
                                                                title="คลิกเพื่อยกเลิกการขาย"
                                                            >
                                                                <Coins size={14} className="group-hover:hidden" /> 
                                                                <X size={14} className="hidden group-hover:block" />
                                                                <span className="group-hover:hidden">{exp.marketplacePrice} TOKEN</span>
                                                                <span className="hidden group-hover:block">ยกเลิกขาย</span>
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                
                {/* === CREATOR TAB === */}
                {activeTab === 'creator' && (
                <div className="grid grid-cols-12 gap-6">
                    {/* Left Panel: Block Library (แยกหมวดหมู่) */}
                    <div className="col-span-5 flex flex-col">
                        <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col flex-1">
                            <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                                📦 กล่องที่มี
                            </h3>
                            <div className="space-y-3 flex-1 overflow-y-auto overflow-x-visible pr-1" style={{ overflow: 'visible auto' }}>
                                {/* All Groups (Default + Custom) - ทุก Block ลบ/ย้าย/ฟังเสียงได้ */}
                                {customGroups.map(group => (
                                    <div key={group.id} className={`bg-white/5 backdrop-blur-sm border ${group.isDefault ? 'border-white/10' : 'border-red-500/20'} rounded-lg`}>
                                        <button 
                                            onClick={() => toggleCategory(group.id)}
                                            className="w-full flex items-center justify-between px-3 py-2 text-white hover:bg-white/5"
                                        >
                                            <span className="font-medium text-sm flex items-center gap-2">
                                                {group.name}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                {!group.isDefault && (
                                                    <span 
                                                        onClick={(e) => { e.stopPropagation(); deleteCustomGroup(group.id); }}
                                                        className="p-1 hover:bg-red-500/20 rounded text-red-400"
                                                    >
                                                        <Trash2 size={12} />
                                                    </span>
                                                )}
                                                {expandedCategories[group.id] !== false ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </div>
                                        </button>
                                        {expandedCategories[group.id] !== false && (
                                            <div className="px-2 pb-2 space-y-1">
                                                {(group.blocks || []).map((block) => (
                                                    <div
                                                        key={block.id}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, { ...block, type: 'custom', groupId: group.id })}
                                                        className="bg-white/10 backdrop-blur-sm border border-white/10 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-2 text-white text-sm font-medium hover:bg-white/20 transition-all group/block relative"
                                                    >
                                                        <GripVertical size={14} className="opacity-50 shrink-0" />
                                                        {block.flag ? (
                                                            <img 
                                                                src={`https://flagcdn.com/20x15/${block.flag}.png`} 
                                                                alt={block.name}
                                                                className="w-5 h-4 object-cover rounded-sm shrink-0"
                                                            />
                                                        ) : block.icon ? (
                                                            <span className="text-base shrink-0">{block.icon}</span>
                                                        ) : null}
                                                        <span className="flex-1 truncate mr-1">{block.name}</span>
                                                        {/* Edit Block Name Button */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const newName = prompt('แก้ไขชื่อ Block:', block.name);
                                                                if (newName && newName.trim() && newName !== block.name) {
                                                                    handleEditBlockName(group.id, block.id, newName.trim());
                                                                }
                                                            }}
                                                            className="p-1 hover:bg-white/20 rounded text-slate-400 hover:text-yellow-400 shrink-0"
                                                            title="แก้ไขชื่อ"
                                                        >
                                                            <Edit3 size={12} />
                                                        </button>
                                                        {/* Dropdown Menu Button */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (openDropdownId === block.id) {
                                                                    setOpenDropdownId(null);
                                                                } else {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setDropdownPosition({ top: rect.bottom + 4, left: rect.right - 140 });
                                                                    setOpenDropdownId(block.id);
                                                                }
                                                            }}
                                                            className="p-1 hover:bg-white/20 rounded text-slate-400 hover:text-white shrink-0"
                                                        >
                                                            <MoreVertical size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                                {(!group.blocks || group.blocks.length === 0) && (
                                                    <p className="text-slate-500 text-xs text-center py-2">ยังไม่มี Block</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                
                                {/* Custom Blocks (ยังไม่จัด Group) */}
                                {customBlocks.length > 0 && (
                                    <div className="bg-white/5 backdrop-blur-sm border border-violet-500/20 rounded-lg overflow-hidden">
                                        <div className="px-3 py-2 text-white font-medium text-sm">🤖 Custom Blocks</div>
                                        <div className="px-2 pb-2 space-y-1">
                                            {customBlocks.map(block => (
                                                <div
                                                    key={block.id}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, { ...block, type: 'custom' })}
                                                    className="bg-white/10 backdrop-blur-sm border border-white/10 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-2 text-white text-sm font-medium hover:bg-white/20 transition-all group"
                                                >
                                                    <GripVertical size={14} className="opacity-50 shrink-0" />
                                                    {block.flag ? (
                                                        <img 
                                                            src={`https://flagcdn.com/20x15/${block.flag}.png`} 
                                                            alt={block.name}
                                                            className="w-5 h-4 object-cover rounded-sm shrink-0"
                                                        />
                                                    ) : block.icon ? (
                                                        <span className="text-base shrink-0">{block.icon}</span>
                                                    ) : null}
                                                    <span className="flex-1 truncate">{block.name}</span>
                                                    <span className="text-xs bg-violet-500/30 px-1 rounded shrink-0">AI</span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openBlockDetail(block); }}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded transition-opacity"
                                                        title="ดูรายละเอียด"
                                                    >
                                                        <Eye size={12} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openMoveBlockModal({ ...block, isCustom: true }); }}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-500/30 rounded transition-opacity text-blue-300"
                                                        title="ย้ายไป Group"
                                                    >
                                                        <MoveRight size={12} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); deleteCustomBlock(block.id); }}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/30 rounded transition-opacity text-red-300"
                                                        title="ลบ"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                {/* Add New Group Button */}
                                <button
                                    onClick={() => setShowAddGroupModal(true)}
                                    className="w-full py-2 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 rounded-lg text-slate-400 hover:text-white text-sm flex items-center justify-center gap-2 transition-all"
                                >
                                    <FolderPlus size={14} /> เพิ่ม Group ใหม่
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    {/* Center Panel: Expander Builder */}
                    <div className="col-span-7 space-y-4">
                        {/* Expander Info */}
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
                            <div className="grid grid-cols-2 gap-6 mb-6">
                                <div>
                                    <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">ชื่อ Expander</label>
                                    <input
                                        type="text"
                                        value={expanderName}
                                        onChange={(e) => setExpanderName(e.target.value)}
                                        placeholder="เช่น Thai Drama Pro"
                                        className="w-full bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 focus:bg-black/60 focus:shadow-lg focus:shadow-red-500/10 transition-all duration-300"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Category</label>
                                    <div className="glass-dropdown-wrapper w-full">
                                        <GlassDropdown
                                            value={selectedCategory}
                                            onChange={setSelectedCategory}
                                            options={CATEGORIES.map(cat => ({ value: cat, label: cat }))}
                                            buttonClassName="glass-dropdown w-full"
                                        />
                                        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">คำอธิบาย</label>
                                <input
                                    type="text"
                                    value={expanderDescription}
                                    onChange={(e) => setExpanderDescription(e.target.value)}
                                    placeholder="อธิบายสั้นๆ ว่า Expander นี้ทำอะไร"
                                    className="w-full bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 focus:bg-black/60 focus:shadow-lg focus:shadow-red-500/10 transition-all duration-300"
                                />
                            </div>
                            
                            {/* Thumbnail Upload */}
                            <div className="mt-4">
                                <label className="text-slate-300 text-sm mb-2 block">Expander Thumbnail</label>
                                <div className="flex items-start gap-4">
                                    {/* Preview */}
                                    <div 
                                        onClick={() => thumbnailInputRef.current?.click()}
                                        className="w-24 h-24 bg-black/30 border border-white/10 rounded-xl flex items-center justify-center cursor-pointer hover:border-red-500/50 transition-colors overflow-hidden"
                                    >
                                        {thumbnailPreview ? (
                                            <img src={thumbnailPreview} alt="Thumbnail" className="w-full h-full object-cover" />
                                        ) : (
                                            <Camera className="text-slate-500" size={32} />
                                        )}
                                    </div>
                                    
                                    {/* Upload Controls */}
                                    <div className="flex-1">
                                        <input
                                            ref={thumbnailInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            onChange={handleThumbnailChange}
                                            className="hidden"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => thumbnailInputRef.current?.click()}
                                            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
                                        >
                                            Choose file
                                        </button>
                                        <span className="ml-2 text-slate-400 text-sm">
                                            {thumbnailFile ? thumbnailFile.name : 'No file chosen'}
                                        </span>
                                        <p className="text-xs text-slate-500 mt-2">Max size: 3MB. Formats: JPG, PNG, WEBP.</p>
                                        {thumbnailPreview && (
                                            <button
                                                type="button"
                                                onClick={clearThumbnail}
                                                className="mt-2 text-xs text-red-400 hover:text-red-300"
                                            >
                                                ลบรูป
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Drop Zone - Drag Reorder */}
                        <div 
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            className="bg-white/10 backdrop-blur-md border-2 border-dashed border-red-500/30 rounded-xl p-4 min-h-[180px]"
                        >
                            <h3 className="text-white font-bold mb-3">🧩 Expander ของคุณ <span className="text-xs font-normal text-slate-400">(ลากเพื่อสลับตำแหน่ง)</span></h3>
                            {selectedBlocks.length === 0 ? (
                                <div className="text-center text-slate-400 py-8">
                                    <p>ลากกล่องจากด้านซ้ายมาวางที่นี่</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {selectedBlocks.map((block, index) => (
                                        <div 
                                            key={block.id}
                                            draggable
                                            onDragStart={(e) => handleBlockDragStart(e, index)}
                                            onDragOver={(e) => handleBlockDragOver(e, index)}
                                            onDragEnd={handleBlockDragEnd}
                                            className={`bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-2 rounded-lg flex items-center gap-2 text-white text-sm font-medium cursor-grab active:cursor-grabbing hover:bg-white/20 transition-all ${draggedBlockIndex === index ? 'opacity-50 border-red-500' : ''}`}
                                        >
                                            <GripVertical size={14} className="opacity-50" />
                                            <span className="bg-red-500/30 px-1.5 py-0.5 rounded text-xs font-bold">{index + 1}</span>
                                            <span className="flex-1">{block.name}</span>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => moveBlockUp(index)}
                                                    disabled={index === 0}
                                                    className="p-1 hover:bg-white/20 rounded disabled:opacity-30"
                                                    title="ขึ้น"
                                                >
                                                    <ArrowUp size={12} />
                                                </button>
                                                <button
                                                    onClick={() => moveBlockDown(index)}
                                                    disabled={index === selectedBlocks.length - 1}
                                                    className="p-1 hover:bg-white/20 rounded disabled:opacity-30"
                                                    title="ลง"
                                                >
                                                    <ArrowDown size={12} />
                                                </button>
                                                <button
                                                    onClick={() => removeBlock(block.id)}
                                                    className="p-1 hover:bg-red-500/30 rounded text-red-300"
                                                    title="ลบ"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {/* Video URLs Section - เฉพาะเจ้าของ Expander */}
                        {!editingExpander?.fromMarketplace && (
                            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-xl p-4">
                                <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                                    🎬 ตัวอย่างวีดีโอ
                                    <span className="text-xs text-slate-400 font-normal">(ต้องมีอย่างน้อย 1 URL ก่อนขาย)</span>
                                </h3>
                                <div className="space-y-3">
                                    {/* Input เพิ่ม URL */}
                                    <div className="flex gap-2">
                                        <input
                                            type="url"
                                            value={newVideoUrl}
                                            onChange={(e) => setNewVideoUrl(e.target.value)}
                                            placeholder="https://youtube.com/watch?v=..."
                                            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 text-sm"
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddVideoUrl()}
                                        />
                                        <button
                                            onClick={handleAddVideoUrl}
                                            className="group relative px-5 py-2.5 bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 hover:from-purple-500 hover:via-purple-400 hover:to-pink-400 rounded-xl text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105 transition-all duration-300 overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                                            <Plus size={14} className="relative z-10 group-hover:rotate-90 transition-transform duration-300" />
                                            <span className="relative z-10">Add VDO</span>
                                        </button>
                                    </div>
                                    
                                    {/* รายการ URLs ที่เพิ่มแล้ว */}
                                    {videoUrls.length > 0 ? (
                                        <div className="space-y-2 max-h-32 overflow-y-auto">
                                            {videoUrls.map((url, index) => (
                                                <div key={index} className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2">
                                                    <span className="text-purple-400 text-sm">🎬</span>
                                                    <a 
                                                        href={url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="flex-1 text-slate-300 text-sm truncate hover:text-purple-400"
                                                    >
                                                        {url}
                                                    </a>
                                                    <button
                                                        onClick={() => handleRemoveVideoUrl(url)}
                                                        className="p-1 hover:bg-red-500/30 rounded text-red-400"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-slate-500 text-xs text-center py-2">ยังไม่มี URL วีดีโอ</p>
                                    )}
                                    
                                    {/* Warning ถ้า blocks เปลี่ยน */}
                                    {editingExpander && videoUrls.length > 0 && (
                                        <p className="text-amber-400 text-xs flex items-center gap-1">
                                            ⚠️ หากเพิ่ม/ลบ Block จะทำให้ URL วีดีโอหายไปทั้งหมด
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        {/* Test Zone */}
                        <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-xl p-4">
                            <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                                <TestTube size={18} className="text-green-400" />
                                ทดสอบ Expander
                            </h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-slate-300 text-sm mb-1 block">Prompt ทดสอบ (ภาษาไทย)</label>
                                    <input
                                        type="text"
                                        value={testPrompt}
                                        onChange={(e) => setTestPrompt(e.target.value)}
                                        placeholder="ใส่ Prompt สั้นๆ"
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                                    />
                                </div>
                                <button
                                    onClick={handleTest}
                                    disabled={testing}
                                    className="group relative w-full py-3 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 hover:from-emerald-500 hover:via-teal-400 hover:to-cyan-400 rounded-2xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] transition-all duration-300 overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                                    {testing ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin relative z-10" />
                                            <span className="relative z-10">กำลังทดสอบ...</span>
                                        </>
                                    ) : (
                                        <>
                                            <TestTube size={16} className="relative z-10 group-hover:rotate-12 transition-transform duration-300" />
                                            <span className="relative z-10">ทดสอบ Expand</span>
                                        </>
                                    )}
                                </button>
                                {testResult && (
                                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 relative">
                                        <button
                                            onClick={handleCopyPrompt}
                                            className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-500 rounded-lg text-white flex items-center gap-1 text-xs font-bold"
                                        >
                                            {copied ? <Check size={14} /> : <Copy size={14} />}
                                            {copied ? 'คัดลอกแล้ว!' : 'คัดลอก'}
                                        </button>
                                        <p className="text-slate-200 text-sm whitespace-pre-wrap pr-24">{testResult}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="group relative flex-1 py-4 bg-gradient-to-r from-violet-600 via-purple-500 to-fuchsia-500 hover:from-violet-500 hover:via-purple-400 hover:to-fuchsia-400 rounded-2xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-xl shadow-purple-500/40 hover:shadow-purple-500/60 hover:scale-[1.02] transition-all duration-300 overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                                {saving ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin relative z-10" />
                                        <span className="relative z-10">กำลังบันทึก...</span>
                                    </>
                                ) : (
                                    <>
                                        <Save size={18} className="relative z-10 group-hover:rotate-12 transition-transform duration-300" />
                                        <span className="relative z-10">{editingExpander ? 'อัปเดต Expander' : 'บันทึก Expander'}</span>
                                    </>
                                )}
                            </button>
                            <button
                                className="group relative px-8 py-4 bg-gradient-to-r from-amber-500 via-orange-400 to-rose-400 hover:from-amber-400 hover:via-orange-300 hover:to-rose-300 rounded-2xl text-white font-bold flex items-center gap-2 shadow-xl shadow-amber-500/40 hover:shadow-amber-500/60 hover:scale-105 transition-all duration-300 overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                                <Upload size={18} className="relative z-10 group-hover:rotate-12 group-hover:-translate-y-1 transition-all duration-300" />
                                <span className="relative z-10">เผยแพร่ขาย</span>
                            </button>
                        </div>
                    </div>
                </div>
                )}
            </div>
            
            {/* Sell Modal */}
            {showSellModal && sellExpander && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Store className="text-yellow-400" /> ขาย Expander
                            </h2>
                            <button
                                onClick={() => setShowSellModal(false)}
                                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        {/* Preview */}
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
                            <div className="flex items-start gap-3">
                                <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg flex items-center justify-center">
                                    <Sparkles className="text-white" size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white">{sellExpander.name}</h3>
                                    <p className="text-sm text-slate-400">{sellExpander.categoryId}</p>
                                    <p className="text-xs text-slate-500 mt-1">{sellExpander.blocks?.length || 0} blocks</p>
                                </div>
                            </div>
                        </div>
                        
                        {/* Price Input */}
                        <div className="mb-6">
                            <label className="text-sm text-slate-300 mb-2 block">ตั้งราคา (TOKEN)</label>
                            <div className="relative">
                                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-400" size={20} />
                                <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={sellPrice}
                                    onChange={(e) => setSellPrice(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white text-xl font-bold focus:outline-none focus:border-yellow-500"
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                ผู้ซื้อจะจ่าย {sellPrice} TOKEN เพื่อติดตั้ง Expander นี้
                            </p>
                        </div>
                        
                        {/* Quick Price Buttons */}
                        <div className="flex gap-2 mb-6">
                            {[5, 10, 25, 50, 100].map(price => (
                                <button
                                    key={price}
                                    onClick={() => setSellPrice(price)}
                                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                                        sellPrice === price
                                            ? 'bg-yellow-500 text-black'
                                            : 'bg-white/10 text-white hover:bg-white/20'
                                    }`}
                                >
                                    {price}
                                </button>
                            ))}
                        </div>
                        
                        {/* Trial Settings */}
                        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                            <label className="flex items-center gap-3 cursor-pointer mb-3">
                                <input
                                    type="checkbox"
                                    checked={allowTrial}
                                    onChange={(e) => setAllowTrial(e.target.checked)}
                                    className="w-5 h-5 rounded bg-black/40 border-white/20 text-blue-500 focus:ring-blue-500"
                                />
                                <span className="text-white font-medium">🎁 อนุญาตให้ทดลองใช้งาน</span>
                            </label>
                            
                            {allowTrial && (
                                <div className="space-y-3 pl-8">
                                    <div className="flex items-center gap-3">
                                        <label className="text-sm text-slate-300 w-24">จำนวนวัน:</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="30"
                                            value={trialDays}
                                            onChange={(e) => setTrialDays(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
                                            className="w-20 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-center focus:outline-none focus:border-blue-500"
                                        />
                                        <span className="text-slate-400 text-sm">วัน</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <label className="text-sm text-slate-300 w-24">ค่าทดลอง:</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={trialFee}
                                            onChange={(e) => setTrialFee(Math.max(0, parseInt(e.target.value) || 0))}
                                            className="w-20 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-center focus:outline-none focus:border-blue-500"
                                        />
                                        <span className="text-slate-400 text-sm">TOKEN {trialFee === 0 && '(ฟรี)'}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Platform Fee Info */}
                        <div className="mb-6 p-3 bg-slate-800/50 rounded-lg border border-white/5">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-slate-400">ราคาขาย</span>
                                <span className="text-white">{sellPrice} TOKEN</span>
                            </div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-slate-400">Platform Fee (10%)</span>
                                <span className="text-red-400">-{Math.floor(sellPrice * 0.10)} TOKEN</span>
                            </div>
                            <div className="flex justify-between text-sm font-bold border-t border-white/10 pt-2 mt-2">
                                <span className="text-slate-300">คุณจะได้รับ</span>
                                <span className="text-green-400">{sellPrice - Math.floor(sellPrice * 0.10)} TOKEN</span>
                            </div>
                        </div>
                        
                        {/* Submit Button */}
                        <button
                            onClick={handlePublishToMarketplace}
                            disabled={publishing}
                            className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 rounded-xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {publishing ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    กำลังเผยแพร่...
                                </>
                            ) : (
                                <>
                                    <Upload size={18} />
                                    เผยแพร่ไปยัง Marketplace
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
            
            {/* FREE Publish Modal */}
            {showFreeModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Package className="text-emerald-400" /> เผยแพร่ฟรี
                            </h2>
                            <button
                                onClick={() => setShowFreeModal(null)}
                                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        {/* Preview */}
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
                            <div className="flex items-start gap-3">
                                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
                                    <Sparkles className="text-white" size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white">{showFreeModal.name}</h3>
                                    <p className="text-sm text-slate-400">{showFreeModal.categoryId}</p>
                                    <p className="text-xs text-slate-500 mt-1">{showFreeModal.blocks?.length || 0} blocks</p>
                                </div>
                            </div>
                        </div>
                        
                        {/* Duration Input */}
                        <div className="mb-6">
                            <label className="text-sm text-slate-300 mb-2 block">ระยะเวลาเผยแพร่ฟรี (วัน)</label>
                            <div className="glass-dropdown-wrapper w-full">
                                <GlassDropdown
                                    value={freeDays}
                                    onChange={(newValue) => setFreeDays(Number(newValue))}
                                    options={[1, 2, 3, 5, 7, 14, 30].map(days => ({ value: days, label: `${days} วัน` }))}
                                    buttonClassName="glass-dropdown w-full text-center text-xl font-bold"
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                ผู้ใช้อื่นสามารถรับ Expander นี้ไปใช้ฟรีได้ {freeDays} วัน หลังจากนั้นจะหายไปจาก Marketplace
                            </p>
                        </div>
                        
                        {/* Quick Duration Buttons */}
                        <div className="flex gap-2 mb-6">
                            {[1, 3, 7, 14, 30].map(days => (
                                <button
                                    key={days}
                                    onClick={() => setFreeDays(days)}
                                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                                        freeDays === days
                                            ? 'bg-emerald-500 text-white'
                                            : 'bg-white/10 text-white hover:bg-white/20'
                                    }`}
                                >
                                    {days}D
                                </button>
                            ))}
                        </div>
                        
                        {/* Info */}
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-6">
                            <p className="text-sm text-emerald-300">
                                🎁 <strong>หมายเหตุ:</strong> ผู้ที่รับ Expander ฟรีจะไม่สามารถนำไปขายต่อได้ ยกเว้นจะแก้ไข blocks ให้ต่างจากเดิม
                            </p>
                        </div>
                        
                        {/* Confirm Button */}
                        <button
                            onClick={() => {
                                if (confirm(`คุณแน่ใจหรือว่าจะเผยแพร่ Expander "${showFreeModal.name}" ให้กับผู้ใช้งานอื่นฟรี ${freeDays} วัน?`)) {
                                    handlePublishFree();
                                }
                            }}
                            disabled={publishingFree}
                            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                        >
                            {publishingFree ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    กำลังเผยแพร่...
                                </>
                            ) : (
                                <>
                                    <Package size={18} />
                                    เผยแพร่ฟรี {freeDays} วัน
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
            
            {/* Block Detail Modal */}
            {showBlockDetail && selectedBlockDetail && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                📦 รายละเอียด Block
                            </h2>
                            <button
                                onClick={() => setShowBlockDetail(false)}
                                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        {/* Block Preview */}
                        <div className={`${selectedBlockDetail.color || 'bg-violet-500'} px-4 py-3 rounded-xl mb-4 flex items-center gap-3`}>
                            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                                <Sparkles className="text-white" size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-lg">{selectedBlockDetail.name}</h3>
                                <p className="text-white/70 text-sm">
                                    {selectedBlockDetail.isCustom ? '🤖 AI Generated' : `📁 ${selectedBlockDetail.type || 'Default'}`}
                                </p>
                            </div>
                        </div>
                        
                        {/* Thai Description */}
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
                            <h4 className="text-sm text-slate-400 mb-2 font-medium">📖 คำอธิบายภาษาไทย</h4>
                            {loadingTranslation ? (
                                <div className="flex items-center gap-2 text-slate-400">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>กำลังแปลเป็นภาษาไทย...</span>
                                </div>
                            ) : (
                                <p className="text-white text-sm leading-relaxed">
                                    {thaiDescription}
                                </p>
                            )}
                        </div>
                        
                        {/* Original Instruction (collapsed) */}
                        <details className="bg-black/20 border border-white/10 rounded-xl p-3 mb-6">
                            <summary className="text-xs text-slate-500 cursor-pointer">ดู Instruction ต้นฉบับ (EN)</summary>
                            <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                                {selectedBlockDetail.instruction}
                            </p>
                        </details>
                        
                        {/* TTS Button */}
                        <button
                            onClick={() => speakBlockDescription()}
                            disabled={loadingTranslation || !thaiDescription}
                            className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                speakingBlock 
                                    ? 'bg-red-500 text-white' 
                                    : loadingTranslation || !thaiDescription
                                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-400 hover:to-purple-400'
                            }`}
                        >
                            {speakingBlock ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    กำลังพูด... (กดเพื่อหยุด)
                                </>
                            ) : (
                                <>
                                    🔊 ฟังคำอธิบายเป็นเสียง
                                </>
                            )}
                        </button>
                        
                        <p className="text-xs text-slate-500 text-center mt-3">
                            กดปุ่มด้านบนเพื่อให้ระบบอ่านคำอธิบาย Block นี้เป็นเสียงภาษาไทย
                        </p>
                    </div>
                </div>
            )}
            
            {/* Add Group Modal */}
            {showAddGroupModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <FolderPlus className="text-red-400" /> สร้าง Group ใหม่
                            </h2>
                            <button
                                onClick={() => setShowAddGroupModal(false)}
                                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        {/* Icon Selection */}
                        <div className="mb-4">
                            <label className="text-sm text-slate-300 mb-2 block">เลือกไอคอน</label>
                            <div className="flex flex-wrap gap-2">
                                {['📌', '🎯', '⭐', '🔥', '💎', '🎨', '🎬', '🎵', '💡', '🌟', '🚀', '❤️'].map(icon => (
                                    <button
                                        key={icon}
                                        onClick={() => setNewGroupIcon(icon)}
                                        className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                                            newGroupIcon === icon 
                                                ? 'bg-red-500/30 border-2 border-red-500' 
                                                : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                        }`}
                                    >
                                        {icon}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {/* Group Name */}
                        <div className="mb-6">
                            <label className="text-sm text-slate-300 mb-2 block">ชื่อ Group</label>
                            <input
                                type="text"
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                placeholder="เช่น Block สำหรับละครไทย"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500"
                            />
                        </div>
                        
                        {/* Preview */}
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-6">
                            <p className="text-slate-400 text-xs mb-1">ตัวอย่าง:</p>
                            <p className="text-white font-medium">{newGroupIcon} {newGroupName || 'ชื่อ Group'}</p>
                        </div>
                        
                        {/* Submit */}
                        <button
                            onClick={handleAddGroup}
                            disabled={!newGroupName.trim()}
                            className="w-full py-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 rounded-xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus size={18} /> สร้าง Group
                        </button>
                    </div>
                </div>
            )}
            
            {/* Move Block to Group Modal */}
            {showMoveBlockModal && blockToMove && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <MoveRight className="text-blue-400" /> ย้าย Block ไป Group
                            </h2>
                            <button
                                onClick={() => { setShowMoveBlockModal(false); setBlockToMove(null); }}
                                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        {/* Block Preview */}
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-6">
                            <p className="text-slate-400 text-xs mb-1">Block ที่จะย้าย:</p>
                            <p className="text-white font-medium">{blockToMove.name}</p>
                        </div>
                        
                        {/* Group List - แสดงเฉพาะ Custom Groups ที่มีอยู่จริง */}
                        <div className="space-y-2 max-h-[350px] overflow-y-auto">
                            <p className="text-slate-400 text-xs mb-2">เลือก Group ที่ต้องการย้ายไป:</p>
                            
                            {/* All Groups (Default + Custom) */}
                            {customGroups
                                .filter(group => group.id !== blockToMove?.fromGroupId)
                                .map(group => (
                                <button
                                    key={group.id}
                                    onClick={() => selectTargetGroup(group)}
                                    className="w-full p-3 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-xl text-left transition-all flex items-center gap-3"
                                >
                                    <span className="text-xl">{group.icon}</span>
                                    <div>
                                        <p className="text-white font-medium">{group.name}</p>
                                        <p className="text-slate-400 text-xs">{(group.blocks || []).length} blocks</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                        
                        {/* Create New Group Button */}
                        <button
                            onClick={() => { setShowMoveBlockModal(false); setShowAddGroupModal(true); }}
                            className="w-full mt-4 p-3 bg-gradient-to-r from-red-600/20 to-orange-600/20 hover:from-red-600/30 hover:to-orange-600/30 border border-red-500/30 rounded-xl text-red-400 font-medium flex items-center justify-center gap-2 transition-all"
                        >
                            <FolderPlus size={16} /> สร้าง Group ใหม่
                        </button>
                    </div>
                </div>
            )}
            
            {/* Confirm Move Modal */}
            {showConfirmMoveModal && blockToMove && selectedTargetGroup && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60]">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <MoveRight size={32} className="text-white" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">ยืนยันการย้าย</h3>
                            <p className="text-slate-300">
                                คุณต้องการย้าย <span className="text-yellow-400 font-semibold">"{blockToMove.name}"</span>
                            </p>
                            <p className="text-slate-300">
                                ไป Group <span className="text-green-400 font-semibold">"{selectedTargetGroup.name}"</span> ที่คุณเลือก?
                            </p>
                        </div>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowConfirmMoveModal(false); setSelectedTargetGroup(null); }}
                                className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={confirmMoveBlock}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl font-medium transition-all"
                            >
                                ✓ ยืนยัน
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Fixed Dropdown Menu - อยู่เหนือทุกสิ่ง */}
            {openDropdownId && (
                <div 
                    className="fixed bg-slate-800 border border-white/20 rounded-lg shadow-2xl min-w-[140px] py-1"
                    style={{ top: dropdownPosition.top, left: dropdownPosition.left, zIndex: 99999 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            const block = customGroups.flatMap(g => g.blocks || []).find(b => b.id === openDropdownId);
                            if (block) openBlockDetail(block);
                            setOpenDropdownId(null); 
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2"
                    >
                        <Eye size={14} /> ดูรายละเอียด
                    </button>
                    <button
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            const block = customGroups.flatMap(g => g.blocks || []).find(b => b.id === openDropdownId);
                            if (block) speakBlockDescription(block);
                            setOpenDropdownId(null); 
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-blue-300 hover:bg-blue-500/20 flex items-center gap-2"
                    >
                        <Volume2 size={14} /> ฟังเสียง
                    </button>
                    <button
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            const group = customGroups.find(g => (g.blocks || []).some(b => b.id === openDropdownId));
                            const block = group?.blocks?.find(b => b.id === openDropdownId);
                            if (block && group) openMoveBlockModal(block, group.id);
                            setOpenDropdownId(null); 
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-green-300 hover:bg-green-500/20 flex items-center gap-2"
                    >
                        <MoveRight size={14} /> ย้าย Group
                    </button>
                    <button
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            const group = customGroups.find(g => (g.blocks || []).some(b => b.id === openDropdownId));
                            if (group) deleteBlockFromGroup(group.id, openDropdownId);
                            setOpenDropdownId(null); 
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/20 flex items-center gap-2"
                    >
                        <Trash2 size={14} /> ลบ
                    </button>
                </div>
            )}
            
            {/* Cancel Trial Confirmation Modal */}
            {showCancelTrialModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-900/95 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 size={32} className="text-red-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">ยกเลิกทดลองใช้งาน?</h3>
                            <p className="text-slate-400 text-sm">
                                คุณแน่ใจหรือว่าต้องการยกเลิกการทดลองใช้งานของ<br/>
                                <span className="text-white font-medium">"{showCancelTrialModal.name}"</span>
                            </p>
                            <p className="text-red-400 text-sm mt-3 bg-red-500/10 px-3 py-2 rounded-lg">
                                ⚠️ คุณจะไม่สามารถทดลองใช้งาน Expander นี้ได้อีก
                            </p>
                        </div>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCancelTrialModal(null)}
                                className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
                            >
                                ไม่ยกเลิก
                            </button>
                            <button
                                onClick={() => handleCancelTrial(showCancelTrialModal)}
                                className="flex-1 px-4 py-3 bg-red-500/20 backdrop-blur-sm border border-red-500/30 hover:bg-red-500/40 text-red-400 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                            >
                                <Trash2 size={16} /> ยกเลิกทดลอง
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Floating AI Chat Button */}
            <button
                onClick={() => setShowAIChat(!showAIChat)}
                className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 rounded-full shadow-lg flex items-center justify-center text-white z-40"
            >
                {showAIChat ? <X size={24} /> : <MessageCircle size={24} />}
            </button>
            
            {/* Floating AI Chat Panel */}
            {showAIChat && (
                <div className="fixed bottom-24 right-6 w-96 h-[500px] bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden">
                    {/* Header */}
                    <div className="p-4 bg-gradient-to-r from-red-900/50 to-orange-900/50 border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center">
                                <Bot size={20} className="text-white" />
                            </div>
                            <div>
                                <h3 className="font-bold text-white">AI Block Generator</h3>
                                <p className="text-xs text-slate-400">สร้างกล่องใหม่ด้วย AI</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {chatMessages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                                    msg.role === 'assistant' 
                                        ? 'bg-slate-800 text-white rounded-tl-none' 
                                        : 'bg-red-600 text-white rounded-tr-none'
                                }`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {chatLoading && (
                            <div className="flex justify-start">
                                <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none">
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    
                    {/* Input */}
                    <div className="p-4 bg-slate-900/50 border-t border-white/5">
                        <div className="relative flex items-center gap-2">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                                placeholder="อยากได้กล่องแบบไหน..."
                                className="w-full bg-slate-800 text-white rounded-full pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-red-500/50 border border-white/10 placeholder-slate-500"
                            />
                            <button
                                onClick={handleChatSend}
                                disabled={!chatInput.trim() || chatLoading}
                                className="absolute right-1 top-1/2 -translate-y-1/2 p-2 bg-red-600 rounded-full text-white hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
                            >
                                <Send size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExpanderCreator;
