export const POST = async (request: Request) => {
  const data = await request.json();
  return new Response(JSON.stringify(data));
};
