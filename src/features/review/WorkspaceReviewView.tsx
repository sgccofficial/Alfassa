import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Material, WorkspaceReview } from "../../types";
import { useAuth } from "../../shared/providers/AuthProvider";
import { subscribeToUserMaterials } from "../../services/material-db";
import { subscribeToUserWorkspaceReviews } from "../../services/review-db";
import { ReviewQueueList } from "./ReviewQueueList";
import { MaterialCanvasView } from "../material/MaterialCanvasView";

export function WorkspaceReviewView() {
  const { user } = useAuth();
  const userId = user?.uid || "guest-user";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();

  // Selected material ID can come from route params (:reviewId or :materialId) or query param
  const activeMaterialId = searchParams.get("materialId") || params.materialId || params.reviewId;

  const [materials, setMaterials] = useState<Material[]>([]);
  const [reviews, setReviews] = useState<WorkspaceReview[]>([]);

  // Subscriptions for queue counts
  useEffect(() => {
    console.log("WorkspaceReviewView: subscribing for userId", userId);
    const unsubMaterials = subscribeToUserMaterials(userId, (m) => {
      console.log("WorkspaceReviewView: received materials", m);
      setMaterials(m);
    });
    const unsubReviews = subscribeToUserWorkspaceReviews(userId, (r) => {
      console.log("WorkspaceReviewView: received reviews", r);
      setReviews(r);
    });

    return () => {
      unsubMaterials();
      unsubReviews();
    };
  }, [userId]);

  // If a specific material is selected, render the unified Material Canvas in review mode
  if (activeMaterialId) {
    return <MaterialCanvasView />;
  }

  // Otherwise, show the Workspace Review Queue List
  return (
    <div className="min-h-screen bg-bg-main p-4 sm:p-6 pb-20">
      <ReviewQueueList
        materials={materials}
        reviews={reviews}
        onSelectReview={(materialId) => navigate(`/material/${materialId}`)}
      />
    </div>
  );
}
