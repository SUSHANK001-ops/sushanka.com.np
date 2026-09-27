import connectDB from "@/lib/db";
import AdminModel from "@/model/adminModel";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    // Coerce to primitives so a JSON object like {"$gt":""} can't be injected
    // into the Mongo query (NoSQL operator injection).
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const admin = await AdminModel.findOne({ email });
    if (!admin) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const token = signToken({
      id: admin._id.toString(),
      email: admin.email,
      username: admin.username,
    });

    // Note: the token is set as an httpOnly cookie only — it is intentionally
    // NOT returned in the body so it can't be placed in localStorage (which
    // would expose it to XSS exfiltration).
    const response = NextResponse.json(
      {
        message: "Login successful",
        admin: { id: admin._id, username: admin.username, email: admin.email },
      },
      { status: 200 }
    );

    // Set HTTP-only cookie for the token
    response.cookies.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
