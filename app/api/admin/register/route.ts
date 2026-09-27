import connectDB from "@/lib/db";
import AdminModel from "@/model/adminModel";
import { requireAdminSession } from "@/lib/adminAuth";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Only an authenticated allowlisted admin (NextAuth session) may create admins.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdminSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized - Only authenticated admins can register new admins" },
        { status: 401 }
      );
    }

    await connectDB();
    const body = await req.json();

    // Coerce to strings so no object/operator can be injected into the query.
    const username = String(body?.username ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!username || !password || !email) {
      return NextResponse.json(
        { error: "Username, password and email are required" },
        { status: 400 }
      );
    }

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if admin already exists
    const existingAdmin = await AdminModel.findOne({
      $or: [{ email }, { username }],
    });
    if (existingAdmin) {
      return NextResponse.json(
        { error: "Admin with this email or username already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const admin = await AdminModel.create({
      username,
      email,
      password: hashedPassword,
    });

    return NextResponse.json(
      {
        message: "Admin registered successfully",
        admin: { id: admin._id, username: admin.username, email: admin.email },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
