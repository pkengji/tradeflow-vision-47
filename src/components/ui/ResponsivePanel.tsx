// src/components/ui/ResponsivePanel.tsx
import { useEffect, useState } from "react";

export default function ResponsivePanel({
  open, onClose, children
}:{ open:boolean, onClose:()=>void, children:any }){
  const [isMobile, setIsMobile] = useState(false);

  useEffect(()=>{
    const q = ()=> setIsMobile(window.innerWidth<768);
    q(); window.addEventListener('resize', q);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return ()=> { window.removeEventListener('resize', q); window.removeEventListener('keydown', onKey); };
  },[onClose]);

  if(!open) return null;

  // Click auf dunklen Hintergrund schließt:
  const Overlay = ({children}:{children:any}) => (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} aria-modal="true" role="dialog">
      {children}
    </div>
  );

  if(isMobile){
    // Bottom sheet (max 85vh) mit eigenem Scroll
    return (
      <Overlay>
        <div
          className="absolute left-0 right-0 bottom-0 max-h-[85vh] overflow-y-auto bg-white dark:bg-zinc-900 rounded-t-2xl p-4"
          onClick={(e)=>e.stopPropagation()}
        >
          {children}
        </div>
      </Overlay>
    );
  }

  // Desktop: Right drawer mit eigenem Scroll
  return (
    <Overlay>
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-white dark:bg-zinc-900 shadow-xl p-4 overflow-y-auto"
        onClick={(e)=>e.stopPropagation()}
      >
        {children}
      </div>
    </Overlay>
  );
}
