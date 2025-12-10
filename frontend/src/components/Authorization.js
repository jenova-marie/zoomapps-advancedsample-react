/* globals zoomSdk */
import { useEffect, useState, useCallback } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Button from "react-bootstrap/Button";
import Auth0User from "./Auth0User";
import Header from "./Header";
import IFrame from "./IFrame";
import Image from "./Image";
import UserInfo from "./UserInfo";
import { useZoomAuth } from "../hooks";

export const Authorization = (props) => {
  const {
    handleUser,
    user,
    userContextStatus,
  } = props;
  const location = useLocation();
  const [showInClientOAuthPrompt, setShowInClientOAuthPrompt] = useState(false);

  // Fetch user data from Zoom REST API (via backend proxy)
  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch("/zoom/api/v2/users/me");
      if (response.status !== 200) throw new Error();
      const userData = await response.json();
      handleUser(userData);
      setShowInClientOAuthPrompt(false);
    } catch (error) {
      console.error(error);
      console.log(
        "Request to Zoom REST API has failed, likely because no Zoom access token exists for this user. You must use the authorize API to get an access token"
      );
      setShowInClientOAuthPrompt(true);
    }
  }, [handleUser]);

  // Tier 2: OAuth flow
  const {
    isAuthorized,
    isGuest,
    authorize,
    promptAuthorize,
    startAuth,
    error: authError,
  } = useZoomAuth({
    onAuthorized: fetchUser,
    onError: (err) => {
      console.error("Auth error:", err);
      setShowInClientOAuthPrompt(true);
    },
  });

  // Fetch user when already authorized
  useEffect(() => {
    if (userContextStatus === "authorized") {
      fetchUser();
    }
  }, [userContextStatus, fetchUser]);

  return (
    <>
      <p>You are on this route: {location.pathname}</p>

      {!isGuest && (
        <Button
          variant="primary"
          onClick={isGuest ? promptAuthorize : authorize}
        >
          {isGuest ? "promptAuthorize" : "authorize"}
        </Button>
      )}

      <div>
        <Header
          navLinks={{ userInfo: "User Info", iframe: "IFrame", image: "Image" }}
        />
        <Routes>
          <Route path="/" element={<Navigate to="/userinfo" replace />} />
          <Route
            path="/userinfo"
            element={
              <UserInfo
                user={user}
                onClick={startAuth}
                showGuestModePrompt={isGuest}
                userContextStatus={userContextStatus}
                showInClientOAuthPrompt={showInClientOAuthPrompt}
              />
            }
          />
          <Route path="/image" element={<Image />} />
          <Route path="/iframe" element={<IFrame />} />
        </Routes>
      </div>
      <Header navLinks={{ auth0Data: "Auth0 User Data" }} />
      <Auth0User user={user} />
    </>
  );
};
