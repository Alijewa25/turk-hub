import React from 'react';
import { Home, BookOpen, Rocket, User } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'home', label: 'Ana Səhifə', icon: Home },
    { id: 'dictionary', label: 'Sözlük', icon: BookOpen },
    { id: 'projects', label: 'Layihələr', icon: Rocket },
    { id: 'profile', label: 'Profil', icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-cardBg border-t border-slate-700 px-4 py-2 flex justify-around items-center z-50 md:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center w-full py-1 transition-colors ${
              isActive ? 'text-skyBlue font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className={`w-6 h-6 ${isActive ? 'scale-110' : ''} transition-transform`} />
            <span className="text-xs mt-1">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
