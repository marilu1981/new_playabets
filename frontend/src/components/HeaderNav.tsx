import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import footerIconCasino from "@/assets/footerIconCasino.webp";
import footerIconLotto from "@/assets/footerIconLotto.webp";
import footerIconAviator from "@/assets/footerIconAviator.webp";

const navItems = [
  { label: "Dashboard", path: "/" },
  { label: "Metrics", path: "/metrics" },
  { label: "Segments", path: "/segments" },
];

const HeaderNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="flex items-center gap-3">
      <div className="flex items-center gap-2 mr-2">
        <img src={footerIconCasino} alt="Casino" className="h-6 w-6" />
        <img src={footerIconLotto} alt="Lotto" className="h-6 w-6" />
        <img src={footerIconAviator} alt="Aviator" className="h-6 w-6" />
      </div>
      <div className="w-px h-6 bg-border" />
      {navItems.map((item) => (
        <button
          key={item.path}
          onClick={() => navigate(item.path)}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            location.pathname === item.path
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
};

export default HeaderNav;
