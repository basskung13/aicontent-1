import { useState, useEffect, useRef } from 'react';
import { Users, Plus, Edit2, Trash2, X, Save, Upload, ArrowLeft, Loader2, Image, Star, Skull, UserCircle, Filter, PlusCircle, MinusCircle, Search, Copy, Pin, SortAsc, Eye, Tag, Heart, ChevronDown } from 'lucide-react';
import GlassDropdown from '../components/ui/GlassDropdown';
import { auth, db, storage } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const APPEARANCE_OPTIONS = {
  skinTone: {
    label: 'สีผิว',
    options: ['ขาว', 'ขาวอมชมพู', 'สองสี', 'แทน', 'น้ำผึ้ง', 'น้ำตาล', 'ดำ']
  },
  eyeColor: {
    label: 'สีดวงตา',
    options: ['ดำ', 'น้ำตาลเข้ม', 'น้ำตาลอ่อน', 'เทา', 'ฟ้า', 'เขียว', 'ทอง', 'แดง']
  },
  eyeShape: {
    label: 'รูปทรงดวงตา',
    options: ['กลม', 'เรียวยาว', 'ตาชั้นเดียว', 'ตาสองชั้น', 'ตาโต', 'ตาเฉี่ยว']
  },
  eyebrows: {
    label: 'คิ้ว',
    options: ['หนา', 'บาง', 'โค้ง', 'ตรง', 'เข้ม', 'อ่อน']
  },
  hairColor: {
    label: 'สีผม',
    options: ['ดำ', 'น้ำตาลเข้ม', 'น้ำตาลอ่อน', 'บลอนด์', 'แดง', 'เทา', 'ขาว', 'ฟ้า', 'ชมพู', 'ม่วง']
  },
  hairStyle: {
    label: 'ทรงผม',
    options: ['สั้น', 'สั้นเกรียน', 'ยาวประบ่า', 'ยาวถึงเอว', 'หยักศก', 'ตรง', 'มัดจุก', 'ถักเปีย', 'หน้าม้า']
  },
  facialHair: {
    label: 'หนวดเครา',
    options: ['ไม่มี', 'หนวดบาง', 'หนวดเข้ม', 'เครา', 'เคราเต็ม', 'หนวดเคราเต็ม']
  },
  outfit: {
    label: 'ชุด',
    options: ['ชุดลำลอง', 'ชุดทำงาน', 'ชุดนักรบ', 'ชุดเกราะ', 'ชุดผ้าคลุม', 'ชุดเจ้าหญิง', 'ชุดนักเรียน', 'ชุดกีฬา', 'ชุดหรูหรา']
  },
  accessories: {
    label: 'เครื่องประดับ',
    options: ['ไม่มี', 'ต่างหู', 'สร้อยคอ', 'กำไล', 'แหวน', 'มงกุฎ', 'หมวก', 'แว่นตา', 'ผ้าพันคอ']
  }
};

const GENDER_OPTIONS = ['ชาย', 'หญิง', 'อื่นๆ'];

const DEFAULT_TAGS = ['นักรบ', 'พ่อมด', 'เจ้าหญิง', 'เจ้าชาย', 'นักล่า', 'นักสืบ', 'นักวิทยาศาสตร์', 'โจร', 'พ่อค้า', 'ชาวบ้าน', 'นักบวช', 'นางฟ้า', 'ปีศาจ'];

const Characters = () => {
  const [characters, setCharacters] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'create' | 'edit'
  const [editingCharacter, setEditingCharacter] = useState(null);
  const [hoveredCharacter, setHoveredCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'main' | 'villain' | 'supporting'
  const [customOptions, setCustomOptions] = useState({});
  const [newOptionInput, setNewOptionInput] = useState({});
  const [customTags, setCustomTags] = useState([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('latest'); // 'latest' | 'name' | 'role'
  const [tagFilter, setTagFilter] = useState('');
  const [previewCharacter, setPreviewCharacter] = useState(null);
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    image: '',
    gender: '',
    personality: '',
    role: 'main',
    voiceStyle: 'normal',
    tags: [],
    isFavorite: false,
    appearance: {
      skinTone: '',
      eyeColor: '',
      eyeShape: '',
      eyebrows: '',
      hairColor: '',
      hairStyle: '',
      facialHair: '',
      outfit: '',
      accessories: ''
    },
    customDescription: ''
  });

  const user = auth.currentUser;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'users', user.uid, 'characters'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chars = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCharacters(chars);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const resetForm = () => {
    setFormData({
      name: '',
      image: '',
      gender: '',
      personality: '',
      role: 'main',
      voiceStyle: 'normal',
      tags: [],
      isFavorite: false,
      appearance: {
        skinTone: '',
        eyeColor: '',
        eyeShape: '',
        eyebrows: '',
        hairColor: '',
        hairStyle: '',
        facialHair: '',
        outfit: '',
        accessories: ''
      },
      customDescription: ''
    });
    setEditingCharacter(null);
  };

  const openCreateView = () => {
    resetForm();
    setViewMode('create');
  };

  const openEditView = (character) => {
    setFormData({
      name: character.name || '',
      image: character.image || '',
      gender: character.gender || '',
      personality: character.personality || '',
      role: character.role || 'main',
      voiceStyle: character.voiceStyle || 'normal',
      tags: character.tags || [],
      isFavorite: character.isFavorite || false,
      appearance: character.appearance || {
        skinTone: '',
        eyeColor: '',
        eyeShape: '',
        eyebrows: '',
        hairColor: '',
        hairStyle: '',
        facialHair: '',
        outfit: '',
        accessories: ''
      },
      customDescription: character.customDescription || ''
    });
    setEditingCharacter(character);
    setViewMode('edit');
  };

  const handleDuplicate = async (character) => {
    if (!user) return;
    try {
      const duplicateData = {
        ...character,
        name: `${character.name} (สำเนา)`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      delete duplicateData.id;
      await addDoc(collection(db, 'users', user.uid, 'characters'), duplicateData);
    } catch (error) {
      console.error('Error duplicating character:', error);
    }
  };

  const handleToggleFavorite = async (character) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'characters', character.id), {
        isFavorite: !character.isFavorite
      });
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const toggleTag = (tag) => {
    const currentTags = formData.tags || [];
    if (currentTags.includes(tag)) {
      setFormData({ ...formData, tags: currentTags.filter(t => t !== tag) });
    } else {
      setFormData({ ...formData, tags: [...currentTags, tag] });
    }
  };

  const generateVisualDescription = () => {
    const parts = [];
    const { appearance } = formData;
    
    if (formData.gender) parts.push(formData.gender);
    if (appearance.skinTone) parts.push(`ผิว${appearance.skinTone}`);
    if (appearance.eyeColor) parts.push(`ดวงตาสี${appearance.eyeColor}`);
    if (appearance.eyeShape) parts.push(`ตา${appearance.eyeShape}`);
    if (appearance.eyebrows) parts.push(`คิ้ว${appearance.eyebrows}`);
    if (appearance.hairColor && appearance.hairStyle) {
      parts.push(`ผม${appearance.hairStyle}สี${appearance.hairColor}`);
    } else if (appearance.hairColor) {
      parts.push(`ผมสี${appearance.hairColor}`);
    } else if (appearance.hairStyle) {
      parts.push(`ผม${appearance.hairStyle}`);
    }
    if (appearance.facialHair && appearance.facialHair !== 'ไม่มี') {
      parts.push(`มี${appearance.facialHair}`);
    }
    if (appearance.outfit) parts.push(`สวม${appearance.outfit}`);
    if (appearance.accessories && appearance.accessories !== 'ไม่มี') {
      parts.push(`ประดับ${appearance.accessories}`);
    }
    if (formData.customDescription) {
      parts.push(formData.customDescription);
    }
    
    return parts.join(' ');
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `users/${user.uid}/characters/${fileName}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setFormData({ ...formData, image: downloadURL });
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('เกิดข้อผิดพลาดในการอัปโหลดรูป');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !formData.name.trim()) return;

    setSaving(true);
    try {
      const visualDescription = generateVisualDescription();
      const dataToSave = {
        ...formData,
        visualDescription,
        updatedAt: new Date()
      };

      if (editingCharacter) {
        await updateDoc(doc(db, 'users', user.uid, 'characters', editingCharacter.id), dataToSave);
      } else {
        await addDoc(collection(db, 'users', user.uid, 'characters'), {
          ...dataToSave,
          createdAt: new Date()
        });
      }
      setViewMode('list');
      resetForm();
    } catch (error) {
      console.error('Error saving character:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (characterId) => {
    if (!user || !window.confirm('ต้องการลบตัวละครนี้หรือไม่?')) return;

    try {
      await deleteDoc(doc(db, 'users', user.uid, 'characters', characterId));
    } catch (error) {
      console.error('Error deleting character:', error);
    }
  };

  const updateAppearance = (key, value) => {
    setFormData({
      ...formData,
      appearance: {
        ...formData.appearance,
        [key]: value
      }
    });
  };

  const getOptionsForKey = (key) => {
    const defaultOptions = APPEARANCE_OPTIONS[key]?.options || [];
    const custom = customOptions[key] || [];
    return [...defaultOptions, ...custom];
  };

  const addCustomOption = (key) => {
    const value = newOptionInput[key]?.trim();
    if (!value) return;
    setCustomOptions(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), value]
    }));
    setNewOptionInput(prev => ({ ...prev, [key]: '' }));
  };

  const removeCustomOption = (key, option) => {
    setCustomOptions(prev => ({
      ...prev,
      [key]: (prev[key] || []).filter(o => o !== option)
    }));
  };

  const filteredCharacters = characters
    .filter(c => roleFilter === 'all' || c.role === roleFilter)
    .filter(c => !searchQuery || c.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(c => !tagFilter || (c.tags || []).includes(tagFilter))
    .sort((a, b) => {
      // Favorites first
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      // Then sort by selected option
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'role') return (a.role || '').localeCompare(b.role || '');
      // Default: latest first
      const aTime = a.createdAt?.toDate?.() || new Date(0);
      const bTime = b.createdAt?.toDate?.() || new Date(0);
      return bTime - aTime;
    });

  const allUsedTags = [...new Set(characters.flatMap(c => c.tags || []))];

  const roleLabels = {
    main: 'ตัวเอก',
    supporting: 'ตัวประกอบ',
    villain: 'ตัวร้าย'
  };

  const voiceLabels = {
    normal: 'ปกติ',
    heroic: 'กล้าหาญ',
    gentle: 'อ่อนโยน',
    villain: 'ชั่วร้าย',
    comic: 'ตลก'
  };

  if (!user) {
    return (
      <div className="p-8">
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 text-center">
          <Users size={48} className="mx-auto mb-4 text-red-400" />
          <h2 className="text-xl font-bold text-white mb-2">กรุณาเข้าสู่ระบบ</h2>
          <p className="text-slate-400">เพื่อจัดการตัวละครของคุณ</p>
        </div>
      </div>
    );
  }

  // Full Page Create/Edit View
  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <div className="min-h-screen p-6 pb-64">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => { setViewMode('list'); resetForm(); }}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
          >
            <ArrowLeft size={24} className="text-white" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {viewMode === 'edit' ? 'แก้ไขตัวละคร' : 'สร้างตัวละครใหม่'}
            </h1>
            <p className="text-slate-400 text-sm">กำหนดรายละเอียดตัวละครสำหรับใช้ใน AI Video</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Image & Basic Info */}
          <div className="lg:col-span-1 space-y-4">
            {/* Image Upload */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-cyan-200 uppercase tracking-widest mb-4">รูปตัวละคร</h3>
              
              <div 
                className="aspect-square bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border-2 border-dashed border-white/20 hover:border-emerald-500/50 transition-colors cursor-pointer overflow-hidden relative group"
                onClick={() => fileInputRef.current?.click()}
              >
                {formData.image ? (
                  <>
                    <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Upload size={32} className="text-white" />
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                    {uploading ? (
                      <Loader2 size={48} className="animate-spin text-emerald-500" />
                    ) : (
                      <>
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
                          <Plus size={32} className="text-emerald-500" />
                        </div>
                        <p className="text-sm">คลิกเพื่ออัปโหลดรูป</p>
                        <p className="text-xs text-slate-500 mt-1">หรือวาง URL ด้านล่าง</p>
                      </>
                    )}
                  </div>
                )}
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              <div className="mt-3">
                <input
                  type="text"
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="หรือวาง URL รูปภาพ..."
                  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Basic Info */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 space-y-4">
              <h3 className="text-sm font-bold text-cyan-200 uppercase tracking-widest">ข้อมูลพื้นฐาน</h3>
              
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">ชื่อตัวละคร *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="เช่น บาส, ออย, ลอร์ดมาร์"
                  className="w-full px-4 py-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:bg-black/60 focus:shadow-lg focus:shadow-emerald-500/10 transition-all duration-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">บุคลิกภาพ</label>
                <input
                  type="text"
                  value={formData.personality}
                  onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
                  placeholder="เช่น กล้าหาญ มุ่งมั่น ใจร้อน"
                  className="w-full px-4 py-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:bg-black/60 focus:shadow-lg focus:shadow-emerald-500/10 transition-all duration-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">เพศ</label>
                <div className="glass-dropdown-wrapper w-full">
                  <GlassDropdown
                    value={formData.gender}
                    onChange={(newValue) => setFormData({ ...formData, gender: newValue })}
                    options={[
                      { value: '', label: '-- เลือก --' },
                      ...GENDER_OPTIONS.map(g => ({ value: g, label: g }))
                    ]}
                    buttonClassName="glass-dropdown w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">บทบาท</label>
                  <div className="glass-dropdown-wrapper w-full">
                    <GlassDropdown
                      value={formData.role}
                      onChange={(newValue) => setFormData({ ...formData, role: newValue })}
                      options={[
                        { value: 'main', label: '⭐ ตัวเอก' },
                        { value: 'supporting', label: '👤 ตัวประกอบ' },
                        { value: 'villain', label: '😈 ตัวร้าย' }
                      ]}
                      buttonClassName="glass-dropdown w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">สไตล์เสียง</label>
                  <div className="glass-dropdown-wrapper w-full">
                    <GlassDropdown
                      value={formData.voiceStyle}
                      onChange={(newValue) => setFormData({ ...formData, voiceStyle: newValue })}
                      options={[
                        { value: 'normal', label: 'ปกติ' },
                        { value: 'heroic', label: 'กล้าหาญ' },
                        { value: 'gentle', label: 'อ่อนโยน' },
                        { value: 'villain', label: 'ชั่วร้าย' },
                        { value: 'comic', label: 'ตลก' }
                      ]}
                      buttonClassName="glass-dropdown w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Appearance Options */}
          <div className="lg:col-span-2 space-y-4">
            {/* Appearance Dropdowns */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-red-300 uppercase tracking-widest mb-4">🎨 รูปลักษณ์ภายนอก</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(APPEARANCE_OPTIONS).map(([key, { label }]) => (
                  <div key={key}>
                    <label className="block text-xs text-slate-400 mb-1">{label}</label>
                    <GlassDropdown
                      value={formData.appearance[key] || ''}
                      onChange={(newValue) => updateAppearance(key, newValue)}
                      options={[
                        { value: '', label: '-- เลือก --' },
                        ...getOptionsForKey(key).map(opt => ({ value: opt, label: opt }))
                      ]}
                      buttonClassName="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-red-500"
                      onAddNew={(newVal) => {
                        setCustomOptions(prev => ({
                          ...prev,
                          [key]: [...(prev[key] || []), newVal]
                        }));
                      }}
                      addNewPlaceholder={`เพิ่ม${label}ใหม่...`}
                    />
                    {/* Show selected value with delete button */}
                    {formData.appearance[key] && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs rounded-full">
                          {formData.appearance[key]}
                          <button 
                            type="button"
                            onClick={() => updateAppearance(key, '')} 
                            className="hover:text-white"
                            title="ลบค่านี้"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 mb-96">
              <h3 className="text-sm font-bold text-red-300 uppercase tracking-widest mb-4">🏷️ Tags (สำหรับจัดหมวดหมู่)</h3>
              
              {/* Add New Tag Input */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTagInput.trim()) {
                      const newTag = newTagInput.trim();
                      if (!customTags.includes(newTag) && !DEFAULT_TAGS.includes(newTag)) {
                        setCustomTags(prev => [...prev, newTag]);
                      }
                      if (!(formData.tags || []).includes(newTag)) {
                        setFormData(prev => ({ ...prev, tags: [...(prev.tags || []), newTag] }));
                      }
                      setNewTagInput('');
                    }
                  }}
                  placeholder="เพิ่ม tag ใหม่..."
                  className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-green-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newTagInput.trim()) {
                      const newTag = newTagInput.trim();
                      if (!customTags.includes(newTag) && !DEFAULT_TAGS.includes(newTag)) {
                        setCustomTags(prev => [...prev, newTag]);
                      }
                      if (!(formData.tags || []).includes(newTag)) {
                        setFormData(prev => ({ ...prev, tags: [...(prev.tags || []), newTag] }));
                      }
                      setNewTagInput('');
                    }
                  }}
                  disabled={!newTagInput.trim()}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={18} />
                </button>
              </div>

              {/* All Tags (Default + Custom) */}
              <div className="flex flex-wrap gap-2">
                {[...DEFAULT_TAGS, ...customTags].map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      (formData.tags || []).includes(tag)
                        ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                        : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* Selected Tags with Delete */}
              {formData.tags?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-xs text-slate-500 mb-2">เลือกแล้ว: {formData.tags.length} tags</p>
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-300 text-sm rounded-lg">
                        {tag}
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))}
                          className="hover:text-white ml-1"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Custom Description */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-cyan-200 uppercase tracking-widest mb-4">📝 รายละเอียดเพิ่มเติม</h3>
              <textarea
                value={formData.customDescription}
                onChange={(e) => setFormData({ ...formData, customDescription: e.target.value })}
                placeholder="รายละเอียดอื่นๆ เช่น รอยแผลเป็นที่แก้ม, ถือดาบยาว, มีปีกนางฟ้า..."
                rows={3}
                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500 resize-none"
              />
            </div>

            {/* Preview Description */}
            <div className="bg-emerald-500/10 backdrop-blur-md border border-emerald-500/30 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-widest mb-2">👁️ ตัวอย่างรูปลักษณ์ (AI จะใช้ข้อความนี้)</h3>
              <p className="text-white text-sm leading-relaxed">
                {generateVisualDescription() || <span className="text-slate-500 italic">เลือกรูปลักษณ์ด้านบนเพื่อสร้างคำอธิบาย...</span>}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 mt-24">
              <button
                onClick={() => { setViewMode('list'); resetForm(); }}
                className="group relative px-6 py-3.5 bg-gradient-to-r from-red-500/20 via-red-500/10 to-orange-500/20 backdrop-blur-md border border-red-500/40 text-red-200 hover:text-white hover:border-red-400/60 rounded-2xl transition-all duration-300 shadow-lg shadow-red-500/20 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/20 to-orange-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.name.trim() || saving}
                className="group relative flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-red-600 via-red-500 to-orange-500 hover:from-red-500 hover:via-orange-500 hover:to-amber-500 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white rounded-2xl font-bold transition-all duration-300 shadow-xl shadow-red-500/40 hover:shadow-orange-500/60 hover:scale-105 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                {saving ? <Loader2 size={20} className="animate-spin relative z-10" /> : <Save size={20} className="relative z-10 group-hover:rotate-12 transition-transform duration-300" />}
                <span className="relative z-10">{viewMode === 'edit' ? 'บันทึกการแก้ไข' : 'สร้างตัวละคร'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="p-6">
      {/* Header - Unified Style */}
      <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl overflow-hidden mb-8">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform duration-300">
                <Users className="text-white group-hover:rotate-12 transition-transform duration-300" size={32} />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900 flex items-center justify-center">
                <span className="text-[8px] font-bold text-black">{characters.length}</span>
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-red-100 to-orange-200 tracking-tight">Characters Library</h1>
              <p className="text-base text-slate-400 font-light flex items-center gap-2 mt-1">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                สร้างและจัดการตัวละครสำหรับใช้ใน Mode
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Sort Bar */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Search Box */}
        <div className="relative flex-1 min-w-[200px] max-w-md group">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-red-400 transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาตัวละคร..."
            className="w-full pl-12 pr-4 py-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 focus:bg-black/60 focus:shadow-lg focus:shadow-red-500/10 transition-all duration-300"
          />
        </div>

        {/* Sort Dropdown */}
        <div className="glass-dropdown-wrapper">
          <GlassDropdown
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: 'latest', label: '🕐 ล่าสุด' },
              { value: 'name', label: '🔤 ชื่อ A-Z' },
              { value: 'role', label: '👤 บทบาท' }
            ]}
            buttonClassName="glass-dropdown pr-10"
          />
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
        </div>

        {/* Tag Filter */}
        {allUsedTags.length > 0 && (
          <div className="glass-dropdown-wrapper">
            <GlassDropdown
              value={tagFilter}
              onChange={setTagFilter}
              placeholder="🏷️ ทุก Tag"
              options={[
                { value: '', label: '🏷️ ทุก Tag' },
                ...allUsedTags.map(tag => ({ value: tag, label: tag }))
              ]}
              buttonClassName="glass-dropdown pr-10"
            />
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Role Filter Tabs */}
      <div className="inline-flex flex-wrap gap-2 bg-black/40 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl shadow-black/50 mb-6">
        <button
          onClick={() => setRoleFilter('all')}
          className={`group relative flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all duration-300 ${
            roleFilter === 'all'
              ? 'bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white shadow-lg shadow-red-500/40 scale-105'
              : 'text-slate-300 hover:bg-white/10 hover:text-white hover:scale-102'
          }`}
        >
          <Filter size={18} className={`transition-transform duration-300 ${roleFilter === 'all' ? 'animate-bounce' : 'group-hover:rotate-12'}`} />
          ทั้งหมด
          {roleFilter === 'all' && <span className="absolute inset-0 rounded-xl bg-white/10 animate-pulse" />}
        </button>
        <button
          onClick={() => setRoleFilter('main')}
          className={`group relative flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all duration-300 ${
            roleFilter === 'main'
              ? 'bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500 text-white shadow-lg shadow-yellow-500/40 scale-105'
              : 'text-slate-300 hover:bg-white/10 hover:text-white hover:scale-102'
          }`}
        >
          <Star size={18} className={`transition-transform duration-300 ${roleFilter === 'main' ? 'animate-bounce' : 'group-hover:rotate-12'}`} />
          ตัวเอก
          {roleFilter === 'main' && <span className="absolute inset-0 rounded-xl bg-white/10 animate-pulse" />}
        </button>
        <button
          onClick={() => setRoleFilter('villain')}
          className={`group relative flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all duration-300 ${
            roleFilter === 'villain'
              ? 'bg-gradient-to-r from-red-600 via-rose-500 to-pink-500 text-white shadow-lg shadow-red-500/40 scale-105'
              : 'text-slate-300 hover:bg-white/10 hover:text-white hover:scale-102'
          }`}
        >
          <Skull size={18} className={`transition-transform duration-300 ${roleFilter === 'villain' ? 'animate-bounce' : 'group-hover:rotate-12'}`} />
          ตัวร้าย
          {roleFilter === 'villain' && <span className="absolute inset-0 rounded-xl bg-white/10 animate-pulse" />}
        </button>
        <button
          onClick={() => setRoleFilter('supporting')}
          className={`group relative flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all duration-300 ${
            roleFilter === 'supporting'
              ? 'bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/40 scale-105'
              : 'text-slate-300 hover:bg-white/10 hover:text-white hover:scale-102'
          }`}
        >
          <UserCircle size={18} className={`transition-transform duration-300 ${roleFilter === 'supporting' ? 'animate-bounce' : 'group-hover:rotate-12'}`} />
          ตัวประกอบ
          {roleFilter === 'supporting' && <span className="absolute inset-0 rounded-xl bg-white/10 animate-pulse" />}
        </button>
      </div>

      {/* Characters Grid */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 size={32} className="animate-spin mx-auto text-red-500" />
          <p className="text-slate-400 mt-4">กำลังโหลด...</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {/* New Character Card - Glow Effect */}
          <div
            onClick={openCreateView}
            className="relative group aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_25px_rgba(239,68,68,0.3)]"
          >
            {/* Animated Border Gradient */}
            <div className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_90deg,#ef4444_180deg,transparent_360deg)] animate-spin opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"></div>
            
            {/* Inner Content */}
            <div className="absolute inset-[2px] bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl z-10 flex flex-col items-center justify-center border border-dashed border-red-500/30 group-hover:border-transparent transition-colors">
              <div className="flex flex-col items-center justify-center transition-transform duration-300 group-hover:scale-110">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4 group-hover:bg-red-500/30 transition-colors">
                  <Plus size={32} className="text-red-500 group-hover:text-red-400" />
                </div>
                <p className="text-slate-400 font-medium group-hover:text-white transition-colors">สร้างตัวละครใหม่</p>
              </div>
            </div>
          </div>

          {/* Existing Characters */}
          {filteredCharacters.map((character) => (
            <div
              key={character.id}
              className="relative group bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden hover:border-red-500/50 hover:shadow-[0_0_15px_rgba(239,68,68,0.15)] transition-all cursor-pointer"
              onClick={() => openEditView(character)}
              onMouseEnter={() => setHoveredCharacter(character.id)}
              onMouseLeave={() => setHoveredCharacter(null)}
            >
              {/* Image */}
              <div className="aspect-square bg-gradient-to-br from-slate-700 to-slate-800 relative">
                {character.image ? (
                  <img
                    src={character.image}
                    alt={character.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Users size={48} className="text-slate-500" />
                  </div>
                )}
                
                {/* Favorite Badge */}
                {character.isFavorite && (
                  <div className="absolute top-2 left-2 p-1 bg-pink-500/80 rounded-full">
                    <Heart size={12} className="text-white fill-white" />
                  </div>
                )}

                {/* Role Badge */}
                <span className={`absolute top-2 right-2 px-2 py-0.5 text-xs rounded-full ${
                  character.role === 'main' ? 'bg-yellow-500/80 text-yellow-900' :
                  character.role === 'villain' ? 'bg-red-500/80 text-white' :
                  'bg-blue-500/80 text-white'
                }`}>
                  {roleLabels[character.role] || character.role}
                </span>
              </div>

              {/* Info */}
              <div className="p-3">
                <h3 className="font-medium text-white truncate">{character.name}</h3>
                <p className="text-xs text-slate-400 truncate">{character.personality || 'ไม่ระบุบุคลิก'}</p>
                {/* Tags */}
                {character.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {character.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 bg-white/10 text-slate-400 text-[10px] rounded">
                        {tag}
                      </span>
                    ))}
                    {character.tags.length > 2 && (
                      <span className="text-[10px] text-slate-500">+{character.tags.length - 2}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                <button
                  onClick={(e) => { e.stopPropagation(); setPreviewCharacter(character); }}
                  className="p-1.5 bg-cyan-500/20 hover:bg-cyan-500/40 rounded-lg transition-colors"
                  title="ดูตัวอย่าง"
                >
                  <Eye size={14} className="text-cyan-400" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleFavorite(character); }}
                  className={`p-1.5 rounded-lg transition-colors ${character.isFavorite ? 'bg-pink-500/40 text-pink-400' : 'bg-white/20 hover:bg-white/30 text-white'}`}
                  title={character.isFavorite ? 'เลิกปักหมุด' : 'ปักหมุด'}
                >
                  <Heart size={14} className={character.isFavorite ? 'fill-current' : ''} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDuplicate(character); }}
                  className="p-1.5 bg-green-500/20 hover:bg-green-500/40 rounded-lg transition-colors"
                  title="คัดลอก"
                >
                  <Copy size={14} className="text-green-400" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openEditView(character); }}
                  className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                  title="แก้ไข"
                >
                  <Edit2 size={14} className="text-white" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(character.id); }}
                  className="p-1.5 bg-red-500/20 hover:bg-red-500/40 rounded-lg transition-colors"
                  title="ลบ"
                >
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>

              {/* Hover Detail Tooltip */}
              {hoveredCharacter === character.id && (
                <div className="absolute left-0 right-0 bottom-full mb-2 mx-2 p-3 bg-slate-900/95 backdrop-blur-md border border-red-500/30 rounded-xl z-10 shadow-xl">
                  {character.gender && (
                    <p className="text-xs text-red-300 mb-1">เพศ: <span className="text-white">{character.gender}</span></p>
                  )}
                  {character.personality && (
                    <p className="text-xs text-red-300 mb-1">บุคลิก: <span className="text-white">{character.personality}</span></p>
                  )}
                  {character.visualDescription && (
                    <>
                      <p className="text-xs text-red-300 mb-1">รูปลักษณ์:</p>
                      <p className="text-xs text-slate-300 leading-relaxed">{character.visualDescription}</p>
                    </>
                  )}
                  {!character.gender && !character.personality && !character.visualDescription && (
                    <p className="text-xs text-slate-500 italic">ไม่มีข้อมูลรายละเอียด</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewCharacter && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewCharacter(null)}
        >
          <div 
            className="bg-slate-900 border border-white/20 rounded-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            <div className="aspect-video bg-gradient-to-br from-slate-700 to-slate-800 relative">
              {previewCharacter.image ? (
                <img src={previewCharacter.image} alt={previewCharacter.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Users size={64} className="text-slate-500" />
                </div>
              )}
              {/* Favorite */}
              {previewCharacter.isFavorite && (
                <div className="absolute top-3 left-3 p-1.5 bg-pink-500/80 rounded-full">
                  <Heart size={16} className="text-white fill-white" />
                </div>
              )}
              {/* Role Badge */}
              <span className={`absolute top-3 right-3 px-3 py-1 text-sm font-medium rounded-full ${
                previewCharacter.role === 'main' ? 'bg-yellow-500/80 text-yellow-900' :
                previewCharacter.role === 'villain' ? 'bg-red-500/80 text-white' :
                'bg-blue-500/80 text-white'
              }`}>
                {roleLabels[previewCharacter.role] || previewCharacter.role}
              </span>
            </div>

            {/* Info */}
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">{previewCharacter.name}</h2>
                {previewCharacter.gender && (
                  <span className="text-sm text-slate-400">{previewCharacter.gender}</span>
                )}
              </div>

              {previewCharacter.personality && (
                <div>
                  <p className="text-xs text-red-300 mb-1">บุคลิก</p>
                  <p className="text-sm text-white">{previewCharacter.personality}</p>
                </div>
              )}

              {previewCharacter.visualDescription && (
                <div>
                  <p className="text-xs text-red-300 mb-1">รูปลักษณ์</p>
                  <p className="text-sm text-slate-300 leading-relaxed">{previewCharacter.visualDescription}</p>
                </div>
              )}

              {previewCharacter.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {previewCharacter.tags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-white/10 text-slate-300 text-xs rounded-lg">
                      🏷️ {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-3 border-t border-white/10">
                <button
                  onClick={() => { setPreviewCharacter(null); openEditView(previewCharacter); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
                >
                  <Edit2 size={16} />
                  แก้ไข
                </button>
                <button
                  onClick={() => { handleDuplicate(previewCharacter); setPreviewCharacter(null); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-xl transition-colors"
                >
                  <Copy size={16} />
                  คัดลอก
                </button>
                <button
                  onClick={() => setPreviewCharacter(null)}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Characters;
