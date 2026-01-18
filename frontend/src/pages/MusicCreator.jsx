import React from 'react';
import { Music, Music2, Disc3, Globe, Zap, TrendingUp, ShoppingBag, Sparkles, Clock, CheckCircle2, ArrowRight, Play, Headphones } from 'lucide-react';

export default function MusicCreator() {
    const features = [
        {
            icon: Music2,
            title: 'สร้างเพลงด้วย AI',
            desc: 'สร้างเพลงต้นฉบับคุณภาพสูงจากข้อความหรือไอเดียของคุณ',
            color: 'pink'
        },
        {
            icon: ShoppingBag,
            title: 'Marketplace ซื้อขายเพลง',
            desc: 'ตลาดซื้อขายเพลงที่ใหญ่ที่สุด รับรายได้จากผลงานของคุณ',
            color: 'yellow'
        },
        {
            icon: Globe,
            title: 'เพลงหลากหลายแนว',
            desc: 'เพลงอีสาน ไทย อังกฤษ ป็อป ร็อค และอีกมากมาย',
            color: 'cyan'
        },
        {
            icon: Zap,
            title: 'ทำงานอัตโนมัติ 100%',
            desc: 'สร้าง มิกซ์ และเผยแพร่โดยไม่ต้องมีความรู้ด้านดนตรี',
            color: 'green'
        }
    ];

    const genres = [
        { name: 'เพลงอีสาน', icon: '🎸' },
        { name: 'เพลงไทย', icon: '🇹🇭' },
        { name: 'Pop', icon: '🎤' },
        { name: 'Rock', icon: '🎸' },
        { name: 'EDM', icon: '🎧' },
        { name: 'Jazz', icon: '🎷' },
        { name: 'Classical', icon: '🎻' },
        { name: 'Hip-Hop', icon: '🎤' }
    ];

    const highlights = [
        'คุณภาพระดับ Studio ความละเอียด 24-bit',
        'ลิขสิทธิ์เป็นของคุณ 100% ใช้เชิงพาณิชย์ได้',
        'รายได้จากการขายเพลงใน Marketplace',
        'รองรับกว่า 50+ แนวเพลงทั่วโลก',
        'AI สร้างเนื้อเพลงและทำนองอัตโนมัติ',
        'เผยแพร่ไป Spotify, YouTube Music และอื่นๆ'
    ];

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-pink-900 via-slate-900 to-slate-950 text-white font-sans overflow-auto relative">
            {/* Animated Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-yellow-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-pink-900/20 via-transparent to-transparent" />
            </div>

            {/* Main Content */}
            <div className="relative z-10 max-w-4xl w-full text-center">
                {/* Coming Soon Badge */}
                <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-600/30 to-yellow-600/30 backdrop-blur-xl rounded-full border border-pink-500/30 mb-8 animate-bounce">
                    <Clock size={18} className="text-pink-300 animate-pulse" />
                    <span className="text-pink-200 font-bold text-sm tracking-widest uppercase">Coming Soon</span>
                    <Sparkles size={18} className="text-yellow-300 animate-pulse" />
                </div>

                {/* Main Icon */}
                <div className="relative mx-auto w-32 h-32 mb-8">
                    <div className="absolute inset-0 bg-gradient-to-br from-pink-500 to-yellow-600 rounded-full blur-2xl opacity-50 animate-pulse" />
                    <div className="relative w-full h-full bg-gradient-to-br from-pink-500 via-rose-600 to-yellow-500 rounded-full flex items-center justify-center shadow-2xl shadow-pink-500/40 animate-[spin_8s_linear_infinite]">
                        <Disc3 size={56} className="text-white animate-[spin_3s_linear_infinite]" style={{ animationDirection: 'reverse' }} />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg animate-bounce">
                        <Play size={14} className="text-white ml-0.5" />
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-pink-100 to-yellow-200 drop-shadow-2xl tracking-tight mb-4">
                    Music Creator
                </h1>

                {/* Subtitle */}
                <p className="text-xl text-pink-200/80 mb-4 max-w-2xl mx-auto">
                    อดใจรออีกนิด! เรากำลังสร้างเครื่องมือสร้างเพลงที่ดีที่สุดในโลก
                </p>
                <p className="text-lg text-slate-400 mb-8 max-w-xl mx-auto">
                    สร้างเพลงคุณภาพระดับ Studio ด้วย AI และขายใน Marketplace เพื่อสร้างรายได้
                </p>

                {/* Genre Tags */}
                <div className="flex flex-wrap justify-center gap-2 mb-12">
                    {genres.map((genre, i) => (
                        <div
                            key={i}
                            className="px-4 py-2 bg-white/5 backdrop-blur-sm rounded-full border border-white/10 hover:bg-white/10 hover:border-pink-500/30 transition-all duration-300 cursor-pointer hover:scale-105"
                        >
                            <span className="mr-2">{genre.icon}</span>
                            <span className="text-sm text-slate-300">{genre.name}</span>
                        </div>
                    ))}
                </div>

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
                <div className="relative bg-gradient-to-br from-pink-900/40 to-slate-900/60 backdrop-blur-xl rounded-3xl border border-pink-500/20 p-8 mb-12 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-pink-500/0 via-pink-500/5 to-pink-500/0 animate-pulse" />
                    
                    <h3 className="text-2xl font-bold text-white mb-6 flex items-center justify-center gap-3">
                        <Headphones size={24} className="text-pink-400" />
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
                    <button className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-pink-600 to-yellow-600 text-white rounded-2xl font-bold shadow-xl shadow-pink-500/30 hover:shadow-pink-500/50 hover:scale-105 transition-all duration-300 cursor-not-allowed opacity-70">
                        <span>แจ้งเตือนเมื่อพร้อมใช้งาน</span>
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
}
