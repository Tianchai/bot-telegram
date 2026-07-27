import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import isBetween from "dayjs/plugin/isBetween";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { Employee, EmployeeShift, Shift } from "@/interfaces/model";

dayjs.extend(utc);
dayjs.extend(isBetween);

/**
 * Send report to the target of Telegram group
 * - FastCron is the service that will trigger this API every 15 minutes
 * - Checking time from shift of employee 1hr before and 15mins after
 */

export const POST = async (request: Request) => {
  const body = await request.json();
  const { shift } = body;

  const targetTime = dayjs(shift * 1000).local();
  const start = targetTime.subtract(1, "hour");
  const end = targetTime.add(15, "minute");

  const supabase = createClient(
    "https://gkomhvdthksfpctqlfli.supabase.co",
    process.env.secret_supabase as string,
  );

  // Fetch data
  const response = await supabase
    .from("employee_shift")
    .select(
      "emp_id!inner (id, name, absence (*), timesheet (*)), shift_id!inner (*)",
    )
    .eq("shift_id.in", targetTime.format("HH:mm:ss"));

  const data = response?.data as unknown as EmployeeShift[] | null;

  const lateEmployees: string[] = [];

  data?.forEach((row) => {
    const { emp_id, shift_id } = row;

    // Check if employee take absence on this shift
    const isAbsenceTaken = (emp_id as Employee)?.absence?.some(
      (abs) =>
        abs.shift_id === (shift_id as Shift).id &&
        targetTime.isSame(dayjs(abs.date), "day"),
    );

    // Check if employee submit timesheet in time
    const isSubmittedInTime = (emp_id as Employee)?.timesheet?.some((ts) =>
      dayjs(ts.created_at).isBetween(start, end, "second", "[]"),
    );

    if (!isAbsenceTaken && !isSubmittedInTime)
      lateEmployees.push((emp_id as Employee)?.name);
  });

  if (lateEmployees?.length)
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: "-1003717168310", // Target group ID
        parse_mode: "MarkdownV2",
        text: `คนมาสาย:\n• ${lateEmployees?.join("\n• ")}`,
      },
    );

  return NextResponse.json(data);
};
