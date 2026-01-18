import React from 'react';
import { Mic, Headphones, Radio, Globe, Zap, TrendingUp, Music2, Sparkles, Clock, CheckCircle2, ArrowRight } from 'lucide-react';

export default function PodcastCreator() {
    const features = [
        {
            icon: Mic,
            title: 'สร้าง Podcast อัตโนมัติ',
            desc: 'AI ช่วยสร้างสคริปต์และเสียงบรรยายคุณภาพสูง',
            color: 'purple'
        },
        {
            icon: Globe,
            title: 'เผยแพร่ทุกแพลตฟอร์ม',
            desc: 'Spotify, Apple Podcasts, Google Podcasts และอื่นๆ',
            color: 'green'
        },
        {
            icon: TrendingUp,
            title: 'รายได้จาก Marketplace',
            desc: 'ขาย Podcast Template และรับรายได้อัตโนมัติ',
            color: 'yellow'
        },
        {
            icon: Zap,
            title: 'ทำงานแบบอัตโนมัติ',
            desc: 'ตั้งเวลาเผยแพร่ ระบบทำงานให้ทั้งหมด',
            color: 'cyan'
        }
    ];

    const highlights = [
        'รองรับภาษาไทย อังกฤษ และอีก 50+ ภาษา',
        'เสียง AI คุณภาพสูงระดับ Studio',
        'ใส่เพลงประกอบและ Sound Effect อัตโนมัติ',
        'วิเคราะห์ผู้ฟังและแนะนำหัวข้อ Trending'
    ];

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-purple-900 via-slate-900 to-slate-950 text-white font-sans overflow-auto relative">
            {/* Animated Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-pink-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent" />
            </div>

            {/* Main Content */}
            <div className="relative z-10 max-w-4xl w-full text-center">
                {/* Coming Soon Badge */}
                <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600/30 to-pink-600/30 backdrop-blur-xl rounded-full border border-purple-500/30 mb-8 animate-bounce">
                    <Clock size={18} className="text-purple-300 animate-pulse" />
                    <span className="text-purple-200 font-bold text-sm tracking-widest uppercase">Coming Soon</span>
                    <Sparkles size={18} className="text-pink-300 animate-pulse" />
                </div>

                {/* Main Icon */}
                <div className="relative mx-auto w-32 h-32 mb-8">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-600 rounded-3xl blur-2xl opacity-50 animate-pulse" />
                    <div className="relative w-full h-full bg-gradient-to-br from-purple-500 via-purple-600 to-pink-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-500/40 animate-[spin_10s_linear_infinite]" style={{ animationDirection: 'reverse' }}>
                        <Mic size={56} className="text-white" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg animate-bounce">
                        <Headphones size={16} className="text-white" />
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-100 to-pink-200 drop-shadow-2xl tracking-tight mb-4">
                    Podcast Creator
                </h1>

                {/* Subtitle */}
                <p className="text-xl text-purple-200/80 mb-4 max-w-2xl mx-auto">
                    อดใจรออีกนิด! เรากำลังสร้างเครื่องมือสร้าง Podcast ที่ทรงพลังที่สุด
                </p>
                <p className="text-lg text-slate-400 mb-12 max-w-xl mx-auto">
                    สร้าง Podcast คุณภาพระดับมืออาชีพ และเผยแพร่ไปยังทุกแพลตฟอร์มของคุณโดยอัตโนมัติ
                </p>

                {/* Feature Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                    {features.map((feature, i) => {
                        const Icon = feature.icon;
                        return (
                            <div
                                key={i}
                                className={`group relative bg-gradient-to-br from-${feature.color}-900/30 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/10 p-5 hover:border-${feature.color}-500/50 transition-all duration-500 hover:scale-[1.02] overflow-hidden text-left`}
                            >
                                {/* Glow Effect */}
                                <div className={`absolute inset-0 bg-gradient-to-r from-${feature.color}-500/0 via-${feature.color}-500/10 to-${feature.color}-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000`} />
                                
                                <div className="flex items-start gap-4 relative">
                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-${feature.color}-400 to-${feature.color}-600 flex items-center justify-center shadow-lg shadow-${feature.color}-500/30 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300`}>
                                        <Icon size={24} className="text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-white mb-1">{feature.title}</h3>
                                        <p className="text-sm text-slate-400">{feature.desc}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Highlights Box */}
                <div className="relative bg-gradient-to-br from-purple-900/40 to-slate-900/60 backdrop-blur-xl rounded-3xl border border-purple-500/20 p-8 mb-12 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-purple-500/0 animate-pulse" />
                    
                    <h3 className="text-2xl font-bold text-white mb-6 flex items-center justify-center gap-3">
                        <Radio size={24} className="text-purple-400" />
                        สิ่งที่คุณจะได้รับ
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {highlights.map((item, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
                                <CheckCircle2 size={20} className="text-green-400 flex-shrink-0" />
                                <span className="text-slate-300">{item}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CTA */}
                <div className="flex flex-col items-center gap-4">
                    <p className="text-slate-500 text-sm">คาดว่าจะพร้อมใช้งานเร็วๆ นี้</p>
                    <button className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-2xl font-bold shadow-xl shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105 transition-all duration-300 cursor-not-allowed opacity-70">
                        <span>แจ้งเตือนเมื่อพร้อมใช้งาน</span>
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
}
