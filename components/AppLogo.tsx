import React from 'react';

interface AppLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const AppLogo: React.FC<AppLogoProps> = ({ 
  className = '', 
  size = 'md',
  showText = false
}) => {
  const sizeMap = {
    sm: { box: 'w-7 h-7', icon: 'text-sm', textTitle: 'text-xs', textSub: 'text-[8px]' },
    md: { box: 'w-9 h-9', icon: 'text-base', textTitle: 'text-sm', textSub: 'text-[9px]' },
    lg: { box: 'w-11 h-11', icon: 'text-lg', textTitle: 'text-base', textSub: 'text-[10px]' },
    xl: { box: 'w-14 h-14', icon: 'text-2xl', textTitle: 'text-xl', textSub: 'text-xs' }
  };

  const currentSize = sizeMap[size];

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Modern Minimalist Portfolio & Vault Logo */}
      <div className={`relative ${currentSize.box} shrink-0 group cursor-pointer`}>
        {/* Outer Glow Effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-tr from-amber-500 to-amber-600 rounded-xl blur-[2px] opacity-70 group-hover:opacity-100 transition duration-300"></div>
        
        {/* Main Logo Badge */}
        <div className="relative w-full h-full bg-slate-900 rounded-xl p-1 flex items-center justify-center border border-amber-400/40 shadow-lg overflow-hidden">
          {/* Minimalist Folder Icon with Golden Amber accent */}
          <div className="relative z-10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform duration-300">
            <i className={`fa-solid fa-folder-open ${currentSize.icon} drop-shadow-sm`}></i>
            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-slate-900"></div>
          </div>
        </div>
      </div>

      {showText && (
        <div className="flex flex-col text-right">
          <h1 className={`${currentSize.textTitle} font-black text-white tracking-wide leading-tight flex items-center gap-1.5`}>
            <span>الحافظة الذكية</span>
            <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[8px] font-bold px-1.5 py-0.2 rounded-full">Pro</span>
          </h1>
          <p className={`${currentSize.textSub} text-slate-400 font-medium tracking-tight leading-none mt-0.5`}>
            Smart Portfolio & Vault
          </p>
        </div>
      )}
    </div>
  );
};
