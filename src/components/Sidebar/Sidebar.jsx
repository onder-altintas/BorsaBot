import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  History,
  Settings,
  LogOut,
  RefreshCcw,
  LineChart
} from 'lucide-react';
import './Sidebar.css';

const SidebarItem = ({ icon: IconComponent, label, active, onClick, variant }) => (
  <div
    className={`sidebar-item ${active ? 'active' : ''} ${variant ? `variant-${variant}` : ''}`}
    onClick={onClick}
  >
    {IconComponent && <IconComponent size={20} />}
    <span>{label}</span>
  </div>
);

const Sidebar = ({ activeTab, setActiveTab, onLogout, onReset, isOpen, onClose }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Panel', icon: LayoutDashboard },
    { id: 'market', label: 'Borsa', icon: LineChart },
    { id: 'portfolio', label: 'Portföy', icon: Wallet },
    { id: 'bots', label: 'Bot', icon: Settings },
    { id: 'history', label: 'Geçmiş', icon: History },
  ];

  const handleReset = async () => {
    if (window.confirm('Tüm portföyünüz ve geçmişiniz silinecek, bakiyeniz 100.000 TL\'ye sıfırlanacak. Emin misiniz?')) {
      const success = await onReset();
      if (success) {
        alert('Hesabınız başarıyla sıfırlandı! 💸');
        setActiveTab('dashboard');
      }
    }
  };

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'show' : ''}`} onClick={onClose} />
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <TrendingUp className="text-success" size={32} />
          <h1>BIST Sim</h1>
        </div>

        <div className="sidebar-menu">
          {menuItems.map(item => (
            <SidebarItem
              key={item.id}
              {...item}
              active={activeTab === item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (window.innerWidth <= 768) onClose();
              }}
            />
          ))}
        </div>

        <div className="sidebar-footer">
          <SidebarItem
            icon={RefreshCcw}
            label="Hesabı Sıfırla"
            variant="danger"
            onClick={handleReset}
          />
          <SidebarItem icon={Settings} label="Ayarlar" onClick={() => setActiveTab('bots')} />
          <SidebarItem icon={LogOut} label="Çıkış Yap" onClick={onLogout} />
        </div>

        <div className="sidebar-version">
          <span>UI v5.0.6</span>
          <span style={{ fontSize: '10px', opacity: '0.6', display: 'block' }}>
            API: {window.backendVersion || 'v5.0.6...'}
          </span>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
