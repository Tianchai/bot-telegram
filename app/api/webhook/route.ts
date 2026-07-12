import { createClient } from "@supabase/supabase-js";

export const POST = async (request: Request) => {
  // Create a single supabase client for interacting with your database
  const supabase = createClient(
    "https://gkomhvdthksfpctqlfli.supabase.co",
    process.env.secret_supabase as string,
  );

  const body = await request.json();
  const { from, text } = body.message;
  const telegramId = from.id; // Telegram ID

  if (text.includes("เข้างาน") || text.includes("ออกงาน")) {
    const type = text.includes("เข้างาน") ? "in" : "out";

    // Get `emp_id` from database table "employee" by using `Telegram ID`
    const { data: employee } = await supabase
      .from("employee")
      .select("*")
      .eq("telegram_id", telegramId);
    const emp_id = employee?.[0].id;

    // Insert record to database table "timesheet"
    // - requires: emp_id, type (in)
    await supabase
      .from("timesheet")
      .insert([{ emp_id: emp_id, type: type }])
      .select();

    return new Response("Submit timesheet successfully");
  }

  return new Response("Command not found");
};
