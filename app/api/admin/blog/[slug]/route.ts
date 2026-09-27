import connectDB from "@/lib/db";
import BlogModel from "@/model/blogModel";
import { requireAdminSession } from "@/lib/adminAuth";
import { sanitizeBlogHtml } from "@/lib/sanitizeBlog";
import { NextRequest, NextResponse } from "next/server";

// GET a single blog by slug
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const admin = await requireAdminSession();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { slug } = await params;
    const blog = await BlogModel.findOne({ slug });

    if (!blog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    return NextResponse.json({ blog }, { status: 200 });
  } catch (error) {
    console.error("Error fetching blog:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// UPDATE a blog by slug
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const admin = await requireAdminSession();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { slug } = await params;
    const body = await req.json();

    // Whitelist updatable fields — never trust the raw body (prevents mass
    // assignment of arbitrary/unexpected schema fields).
    const update: Record<string, unknown> = {};
    if (typeof body.title === "string") update.title = body.title;
    if (typeof body.timeToRead !== "undefined") update.timeToRead = body.timeToRead;
    if (typeof body.Titledescription === "string") update.Titledescription = body.Titledescription;
    if (typeof body.image === "string") update.image = body.image;
    if (typeof body.category === "string") update.category = body.category;
    if (typeof body.author === "string") update.author = body.author;
    if (typeof body.published !== "undefined") update.published = body.published !== false;
    if (typeof body.content === "string") update.content = sanitizeBlogHtml(body.content);
    if (typeof body.tags !== "undefined") {
      update.tags = Array.isArray(body.tags)
        ? body.tags
        : String(body.tags).split(",").map((t: string) => t.trim()).filter(Boolean);
    }

    const blog = await BlogModel.findOneAndUpdate({ slug: String(slug) }, update, {
      new: true,
      runValidators: true,
    });

    if (!blog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Blog updated successfully", blog },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating blog:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE a blog by slug
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const admin = await requireAdminSession();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { slug } = await params;
    const blog = await BlogModel.findOneAndDelete({ slug });

    if (!blog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Blog deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting blog:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
