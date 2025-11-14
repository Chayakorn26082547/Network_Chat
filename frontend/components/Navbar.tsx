"use client";

import React, { useState } from "react";
import { Button } from "@mui/material";
import ChatModal from "./ChatModal";
import ForumIcon from "@mui/icons-material/Forum";
import Logout from "./navbar-components/Logout";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="bg-[#252524] shadow p-4 flex items-center justify-end">
      <div className="flex items-center gap-4">
        <Button
          color="inherit"
          startIcon={<ForumIcon sx={{ color: "#f8f8f8" }} />}
          onClick={() => setOpen(true)}
        />
      </div>
      <Logout />

      {open && <ChatModal onClose={() => setOpen(false)} />}
    </nav>
  );
}
