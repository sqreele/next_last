export function isUsableServerSession(session, now = Date.now()) {
  return !!(
    session?.user &&
    session.user.accessToken &&
    (!session.user.accessTokenExpires || now <= session.user.accessTokenExpires)
  );
}
