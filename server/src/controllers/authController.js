export function getCurrentUser(req, res) {
  return res.json({
    success: true,
    user: req.user,
  });
}