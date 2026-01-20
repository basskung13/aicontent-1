import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Download, RefreshCw, Play, Settings, Zap, HelpCircle, ChevronRight, ExternalLink, CheckCircle, AlertCircle, Link2, FolderKanban, Monitor } from 'lucide-react';

const EXTENSION_VERSION = "1.0.0";
const EXTENSION_DOWNLOAD_URL = "/downloads/content-auto-post-extension.zip";

// Main Tabs for Learn Page
const mainTabs = [
  { id: 'extension', label: '🧩 Extension', icon: Monitor },
  // Future tabs can be added here
  // { id: 'automation', label: '⚡ Automation', icon: Zap },
  // { id: 'projects', label: '📁 Projects', icon: FolderKanban },
];

// Sections organized by tab
const tabSections = {
  extension: [
    {
      id: 'getting-started',
      title: '🚀 เริ่มต้นใช้งาน',
      icon: Play,
      content: [
        { type: 'heading', text: 'ยินดีต้อนรับสู่ Content Auto Post!' },
        { type: 'text', text: 'ระบบอัตโนมัติสำหรับสร้างและโพสต์คอนเทนต์วิดีโอไปยังแพลตฟอร์มต่างๆ' },
        { type: 'steps', items: [
          'ดาวน์โหลดและติดตั้ง Extension',
          'เชื่อมต่อ Extension กับบัญชีของคุณด้วย Key',
          'เลือก Project ที่ต้องการใช้งาน',
          'รอระบบทำงานอัตโนมัติ!'
        ]}
      ]
    },
    {
      id: 'extension-install',
      title: '📥 ติดตั้ง Extension',
      icon: Download,
      content: [
        { type: 'heading', text: 'วิธีติดตั้ง Chrome Extension' },
        { type: 'steps', items: [
          'ดาวน์โหลดไฟล์ Extension (.zip) จากปุ่มด้านล่าง',
          'แตกไฟล์ ZIP ไปยังโฟลเดอร์ที่ต้องการ (เช่น Desktop)',
          'เปิด Chrome แล้วพิมพ์ chrome://extensions/ ในช่อง URL',
          'เปิด "Developer mode" (สวิตช์มุมขวาบน)',
          'กดปุ่ม "Load unpacked" แล้วเลือกโฟลเดอร์ที่แตกไว้',
          'Extension พร้อมใช้งาน! กดไอคอนที่แถบเครื่องมือเพื่อเปิด'
        ]},
        { type: 'tip', text: 'แนะนำให้ Pin Extension ไว้ที่แถบเครื่องมือเพื่อเข้าถึงได้ง่าย' },
        { type: 'download', label: 'ดาวน์โหลด Extension', version: EXTENSION_VERSION }
      ]
    },
    {
      id: 'extension-update',
      title: '🔄 อัปเดต Extension',
      icon: RefreshCw,
      content: [
        { type: 'heading', text: 'วิธีอัปเดต Extension เป็นเวอร์ชันล่าสุด' },
        { type: 'alert', variant: 'info', text: 'เมื่อมี Update ใหม่ Extension จะแจ้งเตือนให้คุณทราบอัตโนมัติ' },
        { type: 'steps', items: [
          'ดาวน์โหลดไฟล์ Extension เวอร์ชันใหม่จากปุ่มด้านล่าง',
          'แตกไฟล์ ZIP ไปยังโฟลเดอร์เดิม (Overwrite ไฟล์เก่าทั้งหมด)',
          'เปิด Chrome แล้วไปที่ chrome://extensions/',
          'หา "Content Auto Post Agent" แล้วกดปุ่ม 🔄 (Reload)',
          'เสร็จสิ้น! Extension อัปเดตเรียบร้อย'
        ]},
        { type: 'download', label: 'ดาวน์โหลด Extension ล่าสุด', version: EXTENSION_VERSION }
      ]
    },
    {
      id: 'connect-project',
      title: '🔗 เชื่อมต่อ Project',
      icon: Link2,
      content: [
        { type: 'heading', text: 'วิธีเชื่อมต่อ Extension กับ Project' },
        { type: 'text', text: 'หลังติดตั้ง Extension แล้ว คุณต้องเชื่อมต่อกับ Project เพื่อเริ่มใช้งาน' },
        { type: 'steps', items: [
          'เปิด Extension โดยกดที่ไอคอนบนแถบเครื่องมือ',
          'ใส่ Key ที่ได้รับจาก Admin (ถ้ายังไม่มี ติดต่อ Admin)',
          'กด "Connect" เพื่อเชื่อมต่อ',
          'เลือก Project ที่ต้องการใช้งานจากรายการ',
          'สถานะจะแสดง "Connected" เมื่อเชื่อมต่อสำเร็จ'
        ]},
        { type: 'alert', variant: 'info', text: 'เปิด Extension ค้างไว้เพื่อให้ระบบทำงานอัตโนมัติตาม Schedule ที่ตั้งไว้' }
      ]
    },
    {
      id: 'using-extension',
      title: '📱 การใช้งาน Extension',
      icon: Monitor,
      content: [
        { type: 'heading', text: 'การใช้งาน Extension ประจำวัน' },
        { type: 'text', text: 'หลังเชื่อมต่อแล้ว Extension จะทำงานอัตโนมัติตาม Schedule ที่ Admin ตั้งไว้' },
        { type: 'steps', items: [
          'เปิด Chrome และเปิด Extension ค้างไว้',
          'ตรวจสอบสถานะ "Connected" ที่แท็บ Projects',
          'ดู Jobs ที่รอดำเนินการได้ที่แท็บ Jobs',
          'ระบบจะทำงานอัตโนมัติเมื่อถึงเวลาที่กำหนด',
          'สามารถดู Log การทำงานได้ที่แท็บ Logs (ถ้ามีสิทธิ์)'
        ]},
        { type: 'tip', text: 'ไม่ต้องทำอะไรเพิ่มเติม! แค่เปิด Extension ค้างไว้ ระบบจะทำงานให้อัตโนมัติ' }
      ]
    }
  ]
};

export default function Learn() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('extension');
  const [activeSection, setActiveSection] = useState('getting-started');

  // Get sections for current tab
  const sections = tabSections[activeTab] || [];

  useEffect(() => {
    const tab = searchParams.get('tab');
    const section = searchParams.get('section');
    
    if (tab && tabSections[tab]) {
      setActiveTab(tab);
    }
    
    if (section) {
      // Find which tab contains this section
      for (const [tabId, tabSectionsList] of Object.entries(tabSections)) {
        if (tabSectionsList.find(s => s.id === section)) {
          setActiveTab(tabId);
          setActiveSection(section);
          break;
        }
      }
      window.scrollTo(0, 0);
    }
  }, [searchParams]);

  const currentSection = sections.find(s => s.id === activeSection);

  const renderContent = (content) => {
    return content.map((item, i) => {
      switch (item.type) {
        case 'heading':
          return <h2 key={i} className="text-2xl font-bold text-white mb-4">{item.text}</h2>;
        case 'text':
          return <p key={i} className="text-gray-300 mb-4">{item.text}</p>;
        case 'steps':
          return (
            <ol key={i} className="space-y-3 mb-6">
              {item.items.map((step, j) => (
                <li key={j} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-r from-red-600 to-orange-500 flex items-center justify-center text-white text-sm font-bold">
                    {j + 1}
                  </span>
                  <span className="text-gray-200 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          );
        case 'download':
          return (
            <div key={i} className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-bold">{item.label}</p>
                  <p className="text-gray-400 text-sm">เวอร์ชัน {item.version}</p>
                </div>
                <a
                  href={EXTENSION_DOWNLOAD_URL}
                  download
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl font-bold shadow-lg shadow-purple-500/30 transition-all hover:scale-105"
                >
                  <Download size={18} />
                  ดาวน์โหลด
                </a>
              </div>
            </div>
          );
        case 'alert':
          return (
            <div key={i} className={`flex items-start gap-3 p-4 rounded-xl mb-4 ${
              item.variant === 'info' ? 'bg-blue-500/20 border border-blue-500/30' :
              item.variant === 'warning' ? 'bg-yellow-500/20 border border-yellow-500/30' :
              'bg-green-500/20 border border-green-500/30'
            }`}>
              <AlertCircle className={`flex-shrink-0 ${
                item.variant === 'info' ? 'text-blue-400' :
                item.variant === 'warning' ? 'text-yellow-400' :
                'text-green-400'
              }`} size={20} />
              <p className="text-gray-200">{item.text}</p>
            </div>
          );
        case 'tip':
          return (
            <div key={i} className="flex items-start gap-3 p-4 rounded-xl mb-4 bg-green-500/20 border border-green-500/30">
              <CheckCircle className="flex-shrink-0 text-green-400" size={20} />
              <p className="text-gray-200">{item.text}</p>
            </div>
          );
        case 'faq':
          return (
            <div key={i} className="space-y-4 mb-4">
              {item.items.map((faq, j) => (
                <div key={j} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white font-bold mb-2">❓ {faq.q}</p>
                  <p className="text-gray-300 text-sm">💡 {faq.a}</p>
                </div>
              ))}
            </div>
          );
        default:
          return null;
      }
    });
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-red-200 mb-2">
            📚 เรียนรู้การใช้งาน
          </h1>
          <p className="text-gray-400">คู่มือและวิธีใช้งาน Content Auto Post</p>
        </div>

        {/* Main Tab Navigation */}
        <div className="mb-6">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-2 inline-flex gap-2">
            {mainTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setActiveSection(tabSections[tab.id]?.[0]?.id || 'getting-started');
                }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-lg'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
            {/* Placeholder for future tabs */}
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-gray-500 text-sm cursor-not-allowed opacity-50">
              <Zap size={18} />
              ⚡ Automation (เร็วๆนี้)
            </div>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Sidebar - Section List */}
          <div className="w-72 flex-shrink-0">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 sticky top-8">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-3 px-2">
                {mainTabs.find(t => t.id === activeTab)?.label || 'หัวข้อ'}
              </p>
              <nav className="space-y-1">
                {sections.map(section => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                      activeSection === section.id
                        ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-lg'
                        : 'text-gray-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <section.icon size={18} />
                    <span className="text-sm font-medium">{section.title}</span>
                    {activeSection === section.id && <ChevronRight size={16} className="ml-auto" />}
                  </button>
                ))}
              </nav>

              {/* Quick Download */}
              <div className="mt-6 pt-4 border-t border-white/10">
                <a
                  href={EXTENSION_DOWNLOAD_URL}
                  download
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl font-bold text-sm shadow-lg transition-all hover:scale-[1.02]"
                >
                  <Download size={16} />
                  ดาวน์โหลด Extension
                </a>
                <p className="text-center text-gray-500 text-xs mt-2">v{EXTENSION_VERSION}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8">
              {currentSection && renderContent(currentSection.content)}

              {/* Navigation */}
              <div className="flex justify-between mt-8 pt-6 border-t border-white/10">
                {sections.findIndex(s => s.id === activeSection) > 0 && (
                  <button
                    onClick={() => setActiveSection(sections[sections.findIndex(s => s.id === activeSection) - 1].id)}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                    ก่อนหน้า
                  </button>
                )}
                <div className="flex-1" />
                {sections.findIndex(s => s.id === activeSection) < sections.length - 1 && (
                  <button
                    onClick={() => setActiveSection(sections[sections.findIndex(s => s.id === activeSection) + 1].id)}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                  >
                    ถัดไป
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
