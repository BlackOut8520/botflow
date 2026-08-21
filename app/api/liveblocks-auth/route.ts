import { Liveblocks } from "@liveblocks/node";

export async function POST(request: Request) {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY || "sk_dev_FWrX5oVNDqvXuE0Hit20u8uFoadtvth1h74aN5-vHassFjJW8vd4fkbcZ6o_JJqJ";
  const liveblocks = new Liveblocks({ secret });
  const { room, name } = await request.json()

  const COLORS = ["#DC2626", "#D97706", "#059669", "#7C3AED", "#DB2777", "#2563EB", "#16A34A"]
  const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)]

  const user = { 
    id: "user-" + Math.floor(Math.random() * 10000), 
    info: { name: name || "Anónimo", color: randomColor } 
  };

  const session = liveblocks.prepareSession(user.id, { userInfo: user.info });
  
  if (room) {
    session.allow(room, session.FULL_ACCESS);
  } else {
    // If no room is requested, just give full access to everything (for dev)
    session.allow("*", session.FULL_ACCESS);
  }

  const { status, body } = await session.authorize();
  return new Response(body, { status });
}
