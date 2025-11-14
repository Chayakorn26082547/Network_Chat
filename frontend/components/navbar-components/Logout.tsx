import LogoutIcon from "@mui/icons-material/Logout";
import { Button } from "@mui/material";
import { useRouter } from "next/navigation";
import { useSocket, disconnectSocket } from "@/hooks/useSocket";

export default function Logout() {
  const router = useRouter();
  const { socket } = useSocket();

  const username =
    typeof window !== "undefined" ? localStorage.getItem("chatUsername") : null;

  const handleLogout = () => {
    if (socket && username) {
      // notify server that user left, then fully disconnect the shared socket
      socket.emit("userLeft", username);
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("chatUsername");
    }
    router.push("/");
  };

  return (
    <div className="flex items-center gap-4">
      <Button
        color="inherit"
        startIcon={<LogoutIcon sx={{ color: "#f8f8f8" }} />}
        onClick={handleLogout}
      />
    </div>
  );
}
