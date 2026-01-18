import React from 'react';
import { Type, Trash2 } from 'lucide-react';

const CinematicStep = ({ stage, onUpdate, onRemove }) => {
    return (
        <div className="bg-slate-800 rounded-lg p-3 border border-white/5 shadow-lg relative group">
            {/* Header: STEP % + Delete Button (ลบ Scene Template แล้ว - Expander จะขยายให้) */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Type size={12} className="text-blue-400" />
                    <span className="text-xs text-gray-400">Step {stage.id ? `#${stage.id}` : ''}</span>
                    <span className="text-[10px] text-green-400 bg-green-500/20 px-1.5 py-0.5 rounded">Expander จะขยายให้อัตโนมัติ</span>
                </div>

                <div className="flex items-center gap-2">
                    {/* PERCENTAGE INPUT */}
                    <div className="flex flex-row items-center gap-2 min-w-fit">
                        <span className="text-sm font-bold text-gray-400 uppercase whitespace-nowrap">STEP %</span>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            value={stage.stepPercentage || 0}
                            onChange={(e) => onUpdate('stepPercentage', parseInt(e.target.value) || 0)}
                            className="w-12 bg-gray-800 text-white text-sm text-center border border-gray-600 rounded py-1 focus:border-yellow-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                        className="text-red-400 hover:text-red-300 transition-colors p-1.5 hover:bg-red-500/10 rounded-md"
                        title="Remove Step"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CinematicStep;
