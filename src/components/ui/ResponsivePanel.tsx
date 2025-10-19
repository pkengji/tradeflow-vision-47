
import { useEffect, useState } from "react";

export default function ResponsivePanel({ open, onClose, children }:{ open:boolean, onClose:()=>void, children:any }){
  const [isMobile, setIsMobile] = useState(false);
  useEffect(()=>{
    const q = ()=> setIsMobile(window.innerWidth<768);
    q(); window.addEventListener('resize', q); return ()=> window.removeEventListener('resize', q);
  },[]);
  if(!open) return null;
  if(isMobile){
    return (
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose}>
        <div className="absolute left-0 right-0 bottom-0 bg-white dark:bg-zinc-900 rounded-t-2xl p-4 min-h-[40vh]" onClick={e=>e.stopPropagation()}>
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-white dark:bg-zinc-900 shadow-xl p-4" onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
