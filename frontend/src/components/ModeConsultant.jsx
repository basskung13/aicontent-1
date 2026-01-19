import React, { useState, useRef, useEffect } from 'react';
import { Brain, X, Send, Sparkles, Check, AlertTriangle, Paperclip } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const ModeConsultant = ({ modeData, setModeData }) => {
    const [isOpen, setIsOpen] = useState(false);
    // AI Mode: 'architect' (สร้างโครงเรื่อง) or 'instruction' (สร้างคำสั่งฉาก)
    const [aiMode, setAiMode] = useState('architect');
    
    const getInitialMessage = (mode) => {
        if (mode === 'instruction') {
            return { role: 'assistant', content: "สวัสดีครับ! ผมคือ AI Scene Writer 🎬\n\nผมจะช่วยเขียน **คำสั่งฉาก (Scene Instruction)** สำหรับแต่ละฉากใน Mode ของคุณครับ\n\nบอกผมว่าต้องการสร้างคำสั่งสำหรับฉากไหนครับ?" };
        }
        return { role: 'assistant', content: "สวัสดีครับ! ผมคือ AI Story Director 🎬\n\nเล่าเรื่องราวที่อยากสร้างมาได้เลย ผมพร้อมช่วยคิดไอเดีย ตัวละคร หรือโครงเรื่องครับ\n\nพอพร้อมแล้ว กดปุ่ม ✨ สร้าง Mode ด้านล่างได้เลย!" };
    };
    
    const [messages, setMessages] = useState([getInitialMessage('architect')]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [pendingFix, setPendingFix] = useState(null); // Stores { suggestedFix, changeLog }
    const [inputFields, setInputFields] = useState(null); // NEW: Dynamic input fields from AI
    const [fieldValues, setFieldValues] = useState({}); // NEW: Values for input fields
    const [undoStack, setUndoStack] = useState([]); // UNDO: Store previous states
    
    // Theme colors based on AI Mode
    const themeColors = aiMode === 'instruction' ? {
        primary: 'orange',
        gradient: 'from-orange-600 to-amber-600',
        gradientHover: 'from-orange-500 to-amber-500',
        bg: 'bg-orange-600',
        bgHover: 'hover:bg-orange-500',
        text: 'text-orange-400',
        border: 'border-orange-500/30',
        bgLight: 'bg-orange-600/20',
        bgLightHover: 'hover:bg-orange-600/40',
        textLight: 'text-orange-300',
        shadow: 'hover:shadow-[0_0_20px_rgba(249,115,22,0.6)]',
        ring: 'focus:ring-orange-500/50'
    } : {
        primary: 'violet',
        gradient: 'from-violet-600 to-fuchsia-600',
        gradientHover: 'from-violet-500 to-fuchsia-500',
        bg: 'bg-violet-600',
        bgHover: 'hover:bg-violet-500',
        text: 'text-violet-400',
        border: 'border-violet-500/30',
        bgLight: 'bg-violet-600/20',
        bgLightHover: 'hover:bg-violet-600/40',
        textLight: 'text-violet-300',
        shadow: 'hover:shadow-[0_0_20px_rgba(168,85,247,0.6)]',
        ring: 'focus:ring-violet-500/50'
    };
    
    // Handle AI Mode change
    const handleAiModeChange = (newMode) => {
        setAiMode(newMode);
        setMessages([getInitialMessage(newMode)]);
        setPendingFix(null);
        setInputFields(null);
        setFieldValues({});
    };

    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, pendingFix]);

    const handleSend = async (manualInput = null) => {
        // Support both manual input (options) and state input (typing)
        const userMessage = (typeof manualInput === 'string' ? manualInput : input).trim();

        if (!userMessage || loading) return;

        // Only clear input if using the text field
        if (typeof manualInput !== 'string') {
            setInput("");
        }

        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            const consultantChat = httpsCallable(functions, 'consultantChat');
            const history = messages.map(m => ({
                role: m.role,
                content: (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)) +
                    (m.role === 'assistant' && m.options && m.options.length > 0
                        ? `\n\n[CONTEXT: I offered these options: ${JSON.stringify(m.options)}]`
                        : "")
            }));

            console.log('[ModeConsultant] Sending to AI:', { message: userMessage, historyLength: history.length });
            
            const response = await consultantChat({
                message: userMessage,
                history: history,
                currentModeData: modeData,
                aiMode: aiMode // Pass AI mode to backend
            });

            console.log('[ModeConsultant] AI Response:', response.data);
            const data = response.data;

            // Handle case where AI returns suggestedFix directly without reply
            const replyText = data.reply || (data.name ? `🎬 **สร้าง Mode เสร็จแล้ว!**\n\n**${data.name}**\n${data.description || ''}\n\nกด Apply เพื่อใช้งานครับ!` : "สร้าง Mode เสร็จแล้วครับ!");
            
            // If response is Mode object directly (no wrapper), wrap it
            const suggestedFix = data.suggestedFix || (data.blocks ? data : null);

            // Add Assistant Reply with Options Support
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: replyText,
                options: data.options || [],
                inputFields: data.inputFields || null
            }]);

            // NEW: If AI requests input fields, store them
            if (data.inputFields && data.inputFields.length > 0) {
                setInputFields(data.inputFields);
                // Set default values
                const defaults = {};
                data.inputFields.forEach(field => {
                    defaults[field.id] = field.default || '';
                });
                setFieldValues(defaults);
            } else {
                setInputFields(null);
            }

            // If there's a fix, store it for the UI Preview
            if (suggestedFix) {
                setPendingFix({
                    fix: suggestedFix,
                    logs: data.changeLog && data.changeLog.length > 0 ? data.changeLog : ["สร้าง Mode ใหม่: " + (suggestedFix.name || "Template")]
                });
            }

            // NEW: Handle Scene Instructions from AI Scene Writer
            if (data.sceneInstructions && data.sceneInstructions.length > 0) {
                console.log('[ModeConsultant] Applying Scene Instructions:', data.sceneInstructions);
                
                // Apply scene instructions to modeData blocks
                setModeData(prevMode => {
                    const updatedBlocks = [...(prevMode.blocks || [])];
                    
                    data.sceneInstructions.forEach(({ blockIndex, instruction }) => {
                        if (updatedBlocks[blockIndex]) {
                            // Update the first evolution step with sceneInstruction
                            if (updatedBlocks[blockIndex].evolution && updatedBlocks[blockIndex].evolution.length > 0) {
                                updatedBlocks[blockIndex].evolution[0] = {
                                    ...updatedBlocks[blockIndex].evolution[0],
                                    sceneInstruction: instruction
                                };
                            } else {
                                // Create evolution if not exists
                                updatedBlocks[blockIndex].evolution = [{
                                    id: Date.now() + blockIndex,
                                    stepPercentage: 100,
                                    sceneInstruction: instruction
                                }];
                            }
                        }
                    });
                    
                    return { ...prevMode, blocks: updatedBlocks };
                });
                
                // Show success message
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `✅ **บันทึกคำสั่งฉากเรียบร้อย!**\n\nได้เพิ่มคำสั่งฉากให้ ${data.sceneInstructions.length} ฉากแล้วครับ\n\nกรุณากด **Save Mode** เพื่อบันทึกการเปลี่ยนแปลง`,
                    options: []
                }]);
            }

        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'assistant', content: "ระบบเกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้งครับ" }]);
        } finally {
            setLoading(false);
        }
    };

    const handleApplyFix = () => {
        if (!pendingFix) return;

        // **UNDO: Save current state before applying changes**
        setUndoStack(prev => [...prev.slice(-9), JSON.parse(JSON.stringify(modeData))]);

        const suggestedFix = pendingFix.fix;
        const cleanFix = { ...suggestedFix };

        // 1. THUMBNAIL GUARD: Purge dangerous fields that crash the UI
        delete cleanFix.thumbnail;
        delete cleanFix.image;
        delete cleanFix.coverImage;

        // 2. Process locations with IDs (MERGE, not replace)
        if (cleanFix.locations && Array.isArray(cleanFix.locations)) {
            cleanFix.locations = cleanFix.locations.map((loc, idx) => ({
                ...loc,
                id: loc.id || Date.now() + idx
            }));
        }

        // 3. Process characters with IDs (MERGE, not replace)
        if (cleanFix.characters && Array.isArray(cleanFix.characters)) {
            cleanFix.characters = cleanFix.characters.map((char, idx) => ({
                ...char,
                id: char.id || Date.now() + idx + 100
            }));
        }

        // **SMART MERGE: Only update fields that AI provides**
        setModeData(prev => ({
            ...prev,
            ...cleanFix,
            // Ensure storyOverview is properly merged
            storyOverview: cleanFix.storyOverview || prev.storyOverview || {},
            // Ensure locations and characters are arrays
            locations: cleanFix.locations || prev.locations || [],
            characters: cleanFix.characters || prev.characters || [],
            // **SMART MERGE: Use existing blocks if AI doesn't provide new ones**
            blocks: (cleanFix.blocks && cleanFix.blocks.length > 0 ? cleanFix.blocks : prev.blocks || []).map((block, blockIdx) => {
                // Find matching block from AI fix (by id or index)
                const aiBlock = cleanFix.blocks?.find(b => b.id === block.id) || cleanFix.blocks?.[blockIdx];
                const prevBlock = prev.blocks?.find(b => b.id === block.id) || prev.blocks?.[blockIdx] || {};
                
                // Merge: AI data > current block > previous block
                const updatedBlock = { ...prevBlock, ...block, ...(aiBlock || {}) };

                // A. ID Guard: Ensure every block has an ID
                if (!updatedBlock.id) {
                    updatedBlock.id = prevBlock.id || Date.now() + blockIdx;
                }

                // B. Ensure type is set
                updatedBlock.type = updatedBlock.type || prevBlock.type || 'dynamic_evolution';
                updatedBlock.isExpanded = true;
                updatedBlock.title = updatedBlock.title || prevBlock.title || `Block ${blockIdx + 1}`;

                // C. **CRITICAL: Map sequencePercentage - prefer AI value, fallback to previous**
                updatedBlock.sequencePercentage = parseInt(aiBlock?.sequencePercentage ?? block.sequencePercentage ?? prevBlock.sequencePercentage ?? 0, 10);

                // D. Evolution/Steps Mapping
                updatedBlock.evolution = updatedBlock.steps || updatedBlock.evolution || [];

                // E. Map Step IDs and all fields
                updatedBlock.evolution = updatedBlock.evolution.map((step, stepIdx) => {
                    const updatedStep = { ...step };
                    
                    // ID Guard for Steps
                    if (!updatedStep.id) {
                        updatedStep.id = Date.now() + blockIdx * 1000 + stepIdx;
                    }
                    
                    // Percentage Guard
                    updatedStep.stepPercentage = parseInt(step.stepPercentage ?? step.percentage ?? 100, 10);

                    // DATA MAPPING FIX (Backend 'visualPrompt' -> Frontend 'rawPrompt')
                    if (step.visualPrompt) {
                        updatedStep.rawPrompt = step.visualPrompt;
                    }
                    
                    // **CRITICAL: Ensure rawPrompt is set**
                    updatedStep.rawPrompt = updatedStep.rawPrompt || step.rawPrompt || '';
                    
                    // Ensure all new fields are passed through
                    updatedStep.audioInstruction = step.audioInstruction || '';
                    updatedStep.cameraAngle = step.cameraAngle || 'Wide Shot';
                    updatedStep.locationId = step.locationId || null;
                    updatedStep.timeOfDay = step.timeOfDay || 'day';
                    updatedStep.bgmMood = step.bgmMood || 'epic';
                    updatedStep.backgroundVoices = step.backgroundVoices || '';
                    updatedStep.isExpanded = true;
                    
                    // **CRITICAL: Process dialogues with all fields**
                    if (step.dialogues && Array.isArray(step.dialogues)) {
                        updatedStep.dialogues = step.dialogues.map((d, dIdx) => ({
                            id: d.id || Date.now() + blockIdx * 10000 + stepIdx * 100 + dIdx,
                            characterId: d.characterId || null,
                            text: d.text || '',
                            timing: d.timing || 'start',
                            type: d.type || 'main'
                        }));
                    } else {
                        updatedStep.dialogues = [];
                    }
                    
                    return updatedStep;
                });

                return updatedBlock;
            })
        }));


        setMessages(prev => [...prev, { role: 'assistant', content: "✅ เจ๋งมาก! ผมปรับปรุงโครงสร้าง Mode ให้เรียบร้อยแล้วครับ" }]);
        setPendingFix(null);
    };

    const handleCancelFix = () => {
        setPendingFix(null);
        setMessages(prev => [...prev, { role: 'assistant', content: "รับทราบครับ ยกเลิกการแก้ไขแล้ว" }]);
    };

    // **UNDO: Restore previous state**
    const handleUndo = () => {
        if (undoStack.length === 0) {
            setMessages(prev => [...prev, { role: 'assistant', content: "❌ ไม่มีข้อมูลให้ Undo ครับ" }]);
            return;
        }
        const previousState = undoStack[undoStack.length - 1];
        setUndoStack(prev => prev.slice(0, -1));
        setModeData(previousState);
        setMessages(prev => [...prev, { role: 'assistant', content: "↩️ Undo สำเร็จ! กู้คืนข้อมูลก่อนหน้าแล้วครับ" }]);
    };

    return (
        <>
            {/* 1. BRAIN TRIGGER */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-[20px] right-[20px] z-50 w-12 h-12 rounded-full flex items-center justify-center transition-all bg-gradient-to-br ${themeColors.gradient} hover:scale-110 active:scale-95 border-2 border-white/20 shadow-lg ${themeColors.shadow}`}
            >
                {isOpen ? <X size={20} className="text-white" /> : <Brain size={24} className="text-white animate-pulse" />}
            </button>

            {/* 2. CHAT WINDOW */}
            {isOpen && (
                <div className="fixed bottom-[20px] right-[80px] z-50 w-[400px] max-h-[80vh] h-[650px] bg-[#0f172a] rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden backdrop-blur-xl bg-opacity-95 animate-in slide-in-from-right-10 fade-in duration-300">
                    {/* Header */}
                    <div className="p-4 bg-slate-900/50 border-b border-white/5">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full ${themeColors.bgLight} flex items-center justify-center transition-colors`}>
                                    <Brain size={20} className={themeColors.text} />
                                </div>
                                <div>
                                    <h3 className="text-white font-bold text-lg">
                                        {aiMode === 'instruction' ? 'AI Scene Writer' : 'AI Story Director'}
                                    </h3>
                                    <p className="text-xs text-slate-400 font-mono">
                                        {aiMode === 'instruction' ? 'ผู้เขียนคำสั่งฉาก' : 'ผู้กำกับหนัง AI ระดับโลก'}
                                    </p>
                                </div>
                            </div>
                            {/* UNDO Button */}
                            {undoStack.length > 0 && (
                                <button
                                    onClick={handleUndo}
                                    className="px-3 py-1.5 bg-orange-600/20 hover:bg-orange-600/40 text-orange-300 text-xs rounded-lg border border-orange-500/30 transition-all flex items-center gap-1"
                                    title={`Undo (${undoStack.length} ขั้นตอน)`}
                                >
                                    ↩️ Undo
                                </button>
                            )}
                        </div>
                        {/* Mode Switcher */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleAiModeChange('architect')}
                                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                                    aiMode === 'architect'
                                        ? 'bg-violet-600 text-white shadow-lg'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                            >
                                <Sparkles size={14} />
                                สร้างโครงเรื่อง
                            </button>
                            <button
                                onClick={() => handleAiModeChange('instruction')}
                                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                                    aiMode === 'instruction'
                                        ? 'bg-orange-600 text-white shadow-lg'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                            >
                                <Brain size={14} />
                                สร้างคำสั่งฉาก
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-tr-none'
                                    : 'bg-slate-800 text-slate-200 border border-white/5 rounded-tl-none'
                                    }`}>
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                                </div>

                                {msg.role === 'assistant' && idx === messages.length - 1 && pendingFix && (
                                    <div className="mt-3 animate-fade-in-up bg-slate-900/80 border border-yellow-500/30 rounded-xl p-4 w-full max-w-[95%]">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Sparkles size={16} className="text-yellow-400" />
                                            <span className="text-yellow-400 font-bold text-sm">Proposed Changes</span>
                                        </div>
                                        <div className="space-y-2 mb-4 max-h-[150px] overflow-y-auto custom-scrollbar">
                                            {pendingFix.logs && pendingFix.logs.map((log, i) => (
                                                <div key={i} className="flex gap-2 text-xs text-slate-300 bg-black/20 p-2 rounded border border-white/5">
                                                    <span>{log}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleApplyFix}
                                                className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                                            >
                                                <Check size={14} /> Apply Fix
                                            </button>
                                            <button
                                                onClick={handleCancelFix}
                                                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-lg text-sm font-bold transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* 🆕 Quick Reply Options */}
                                {msg.role === 'assistant' && msg.options && msg.options.length > 0 && idx === messages.length - 1 && !inputFields && (
                                    <div className="mt-2 flex flex-wrap gap-2 max-w-[90%] animate-fade-in">
                                        {msg.options.map((opt, i) => (
                                            <button
                                                key={i}
                                                onClick={() => handleSend(opt)}
                                                disabled={loading || pendingFix !== null}
                                                className={`px-3 py-1.5 ${themeColors.bgLight} ${themeColors.bgLightHover} ${themeColors.textLight} text-xs rounded-full border ${themeColors.border} transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* 🆕 Dynamic Input Fields from AI */}
                        {inputFields && inputFields.length > 0 && (
                            <div className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-4 animate-fade-in">
                                <div className="flex items-center gap-2 mb-3">
                                    <Sparkles size={16} className="text-cyan-400" />
                                    <span className="text-cyan-400 font-bold text-sm">กรอกข้อมูลเพิ่มเติม</span>
                                </div>
                                <div className="space-y-3">
                                    {inputFields.map((field) => (
                                        <div key={field.id}>
                                            <label className="text-xs text-gray-400 mb-1 block">{field.label}</label>
                                            {field.type === 'textarea' ? (
                                                <textarea
                                                    value={fieldValues[field.id] || ''}
                                                    onChange={(e) => setFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                                                    placeholder={field.placeholder}
                                                    className="w-full h-16 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-cyan-500 outline-none resize-none"
                                                />
                                            ) : (
                                                <input
                                                    type={field.type || 'text'}
                                                    value={fieldValues[field.id] || ''}
                                                    onChange={(e) => setFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                                                    placeholder={field.placeholder}
                                                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-cyan-500 outline-none"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={() => {
                                            // Format field values as message and send
                                            const formatted = inputFields.map(f => `${f.label}: ${fieldValues[f.id] || '(ไม่ระบุ)'}`).join('\n');
                                            setInputFields(null);
                                            setFieldValues({});
                                            handleSend(formatted);
                                        }}
                                        disabled={loading}
                                        className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        <Send size={14} /> ส่งข้อมูล
                                    </button>
                                    <button
                                        onClick={() => {
                                            // Let AI decide - send special message
                                            setInputFields(null);
                                            setFieldValues({});
                                            handleSend("🤖 ให้ AI เลือกให้ฉันเลย (เลือกสิ่งที่เหมาะสมที่สุด)");
                                        }}
                                        disabled={loading}
                                        className="flex-1 bg-violet-600 hover:bg-violet-500 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        <Sparkles size={14} /> AI เลือกให้
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 3. SMART FIX INTERACTION (PREVIEW) */}


                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none border border-white/5">
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

                    {/* Generate Mode Button */}
                    <div className="px-4 py-2 bg-gradient-to-r from-emerald-900/30 to-cyan-900/30 border-t border-emerald-500/20">
                        <button
                            onClick={() => handleSend("[[GENERATE_MODE]]")}
                            disabled={loading || pendingFix !== null || messages.length < 3}
                            className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-emerald-500/20"
                            title={messages.length < 3 ? "คุยกับ AI ก่อนสักหน่อย" : "สร้าง Mode จากการสนทนา"}
                        >
                            <Sparkles size={16} />
                            สร้าง Mode จากการสนทนา
                        </button>
                    </div>

                    {/* Input */}
                    <div className="p-4 bg-slate-900/50 border-t border-white/5">
                        <div className="relative flex items-center gap-2">
                            {/* Attachment Icon (Visual Only) */}
                            <button className="text-slate-400 hover:text-white transition-colors" title="Attach visual reference">
                                <Paperclip size={20} />
                            </button>

                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder={aiMode === 'instruction' ? 'บอกฉากที่ต้องการสร้างคำสั่ง...' : 'เล่าเรื่องราวที่อยากสร้าง...'}
                                    disabled={pendingFix !== null}
                                    className={`w-full bg-slate-800 text-white rounded-full pl-4 pr-10 py-3 text-sm focus:outline-none focus:ring-1 ${themeColors.ring} border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed placeholder-slate-500`}
                                />
                                <button
                                    onClick={() => handleSend()}
                                    disabled={!input.trim() || loading || pendingFix !== null}
                                    className={`absolute right-1 top-1/2 -translate-y-1/2 p-2 ${themeColors.bg} rounded-full text-white ${themeColors.bgHover} disabled:bg-slate-700 disabled:text-slate-500 transition-colors`}
                                >
                                    <Send size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ModeConsultant;
