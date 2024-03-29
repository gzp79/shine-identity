use crate::{auth::AuthServiceState, openapi::ApiKind};
use axum::{extract::State, http::StatusCode, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use shine_service::{
    axum::{ApiEndpoint, ApiMethod, Problem, ValidatedQuery},
    service::CheckedCurrentUser,
};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;
use validator::Validate;

#[derive(Deserialize, Validate, IntoParams)]
#[serde(rename_all = "camelCase")]
struct Query {
    refresh: Option<bool>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct CurrentUserInfo {
    user_id: Uuid,
    name: String,
    is_email_confirmed: bool,
    session_length: u64,
    roles: Vec<String>,
}

/// Get the information about the current user. The cookie is not accessible
/// from javascript, thus this endpoint can be used to get details about the current user.
async fn user_info_get(
    State(state): State<AuthServiceState>,
    user: CheckedCurrentUser,
    ValidatedQuery(query): ValidatedQuery<Query>,
) -> Result<Json<CurrentUserInfo>, Problem> {
    // find extra information not present in the session data
    let identity = state
        .identity_manager()
        .find_by_id(user.user_id)
        .await
        .map_err(Problem::internal_error_from)?
        //in the very unlikely case, when the identity is deleted just after session validation, a not found is returned.
        .ok_or_else(|| Problem::not_found().with_instance(format!("{{auth_api}}/identities/{}", user.user_id)))?;

    // make sure the redis is updated
    let user = if query.refresh.unwrap_or(false) {
        let roles = state
            .identity_manager()
            .get_roles(user.user_id)
            .await
            .map_err(Problem::internal_error_from)?
            .ok_or_else(|| Problem::not_found().with_instance(format!("{{auth_api}}/identities/{}", user.user_id)))?;

        state
            .session_manager()
            .update(user.key, &identity, &roles)
            .await
            .map_err(Problem::internal_error_from)?
            .ok_or_else(|| Problem::not_found().with_instance(format!("{{auth_api}}/identities/{}", user.user_id)))?
    } else {
        user.into_user()
    };

    let session_length = (Utc::now() - user.session_start).num_seconds();
    let session_length = if session_length < 0 { 0 } else { session_length as u64 };
    Ok(Json(CurrentUserInfo {
        user_id: user.user_id,
        name: user.name,
        is_email_confirmed: identity.is_email_confirmed,
        session_length,
        roles: user.roles,
    }))
}

pub fn ep_user_info_get() -> ApiEndpoint<AuthServiceState> {
    ApiEndpoint::new(ApiMethod::Get, ApiKind::Api("/auth/user/info"), user_info_get)
        .with_operation_id("user_info_get")
        .with_tag("auth")
        .with_query_parameter::<Query>()
        .with_json_response::<CurrentUserInfo>(StatusCode::OK)
}
