use crate::{
    auth::{
        ep_get_providers, ep_user_info, oauth2_client::OAuth2Client, oauth2_page_auth, oauth2_page_login,
        oidc_client::OIDCClient, oidc_page_auth, oidc_page_login, page_delete_user, page_logout, AuthSessionMeta,
    },
    db::{IdentityManager, NameGenerator, SessionManager},
};
use axum::{response::Html, routing::get, Extension, Router};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};
use tera::Tera;
use thiserror::Error as ThisError;
use url::Url;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ExternalUserInfoExtensions {
    GithubEmail,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuth2Config {
    pub authorization_url: String,
    pub token_url: String,
    pub user_info_url: String,
    pub user_info_mapping: HashMap<String, String>,
    pub extensions: HashSet<ExternalUserInfoExtensions>,
    pub client_id: String,
    pub client_secret: String,
    pub scopes: Vec<String>,
    pub redirect_url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OIDCConfig {
    pub discovery_url: String,
    pub client_id: String,
    pub client_secret: String,
    pub scopes: Vec<String>,
    pub redirect_url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    pub api_url: Url,
    pub external_login_secret: String,
    pub token_login_secret: String,
    pub signature_secret: String,
    pub openid: HashMap<String, OIDCConfig>,
    pub oauth2: HashMap<String, OAuth2Config>,
}

#[derive(Debug, ThisError)]
pub enum AuthBuildError {
    #[error("Missing or invalid domain for application")]
    MissingHomeDomain,
    #[error("Provider ({0}) already registered")]
    ProviderConflict(String),
    #[error("Auth session error: {0}")]
    InvalidAuthSession(String),
    #[error("Invalid issuer url: {0}")]
    InvalidIssuer(String),
    #[error("Invalid auth url: {0}")]
    InvalidAuthUrl(String),
    #[error("Invalid token url: {0}")]
    InvalidTokenUrl(String),
    #[error("Invalid user info url: {0}")]
    InvalidUserInfoUrl(String),
    #[error("Invalid redirect url: {0}")]
    RedirectUrl(String),
    #[error("Failed to discover open id: {0}")]
    Discovery(String),
}

#[derive(Clone)]
struct Inner {
    tera: Tera,
    identity_manager: IdentityManager,
    session_manager: SessionManager,
    name_generator: NameGenerator,

    home_url: Url,
    providers: Vec<String>,
}

#[derive(Clone)]
pub(in crate::auth) struct AuthServiceState(Arc<Inner>);

impl AuthServiceState {
    pub fn tera(&self) -> &Tera {
        &self.0.tera
    }

    pub fn identity_manager(&self) -> &IdentityManager {
        &self.0.identity_manager
    }

    pub fn session_manager(&self) -> &SessionManager {
        &self.0.session_manager
    }

    pub fn name_generator(&self) -> &NameGenerator {
        &self.0.name_generator
    }

    pub fn home_url(&self) -> &Url {
        &self.0.home_url
    }

    pub fn providers(&self) -> &[String] {
        &self.0.providers
    }
}

pub struct AuthServiceDependencies {
    pub tera: Tera,
    pub identity_manager: IdentityManager,
    pub session_manager: SessionManager,
    pub name_generator: NameGenerator,
}

pub struct AuthServiceBuilder {
    state: AuthServiceState,
    auth_session_meta: AuthSessionMeta,
    openid_clients: Vec<OIDCClient>,
    oauth2_clients: Vec<OAuth2Client>,
}

impl AuthServiceBuilder {
    pub async fn new(
        dependencies: AuthServiceDependencies,
        config: &AuthConfig,
        home_url: &Url,
        user_secret: &str,
    ) -> Result<Self, AuthBuildError> {
        let mut providers = HashSet::new();

        let domain = home_url.domain().ok_or(AuthBuildError::MissingHomeDomain)?;

        let mut openid_clients = Vec::new();
        for (provider, provider_config) in &config.openid {
            if !providers.insert(provider.clone()) {
                return Err(AuthBuildError::ProviderConflict(provider.clone()));
            }

            let connect = OIDCClient::new(provider, provider_config).await?;
            openid_clients.push(connect);
        }

        let mut oauth2_clients = Vec::new();
        for (provider, provider_config) in &config.oauth2 {
            if !providers.insert(provider.clone()) {
                return Err(AuthBuildError::ProviderConflict(provider.clone()));
            }

            let connect = OAuth2Client::new(provider, provider_config).await?;
            oauth2_clients.push(connect);
        }

        let state = AuthServiceState(Arc::new(Inner {
            tera: dependencies.tera,
            identity_manager: dependencies.identity_manager,
            session_manager: dependencies.session_manager,
            name_generator: dependencies.name_generator,
            home_url: home_url.to_owned(),
            providers: providers.into_iter().collect(),
        }));

        let auth_session_meta = AuthSessionMeta::new(
            domain,
            config.api_url.clone(),
            None,
            user_secret,
            &config.external_login_secret,
            &config.token_login_secret,
            &config.signature_secret,
        )
        .map_err(|err| AuthBuildError::InvalidAuthSession(format!("{err}")))?;

        Ok(Self {
            state,
            auth_session_meta,
            openid_clients,
            oauth2_clients,
        })
    }

    pub fn into_router<S>(self) -> (Router<S>, Router<S>)
    where
        S: Clone + Send + Sync + 'static,
    {
        let page_router = {
            let mut router = Router::new()
                .route("/auth/logout", get(page_logout::logout))
                .route("/auth/delete", get(page_delete_user::user_delete));

            for openid_client in self.openid_clients {
                let path = format!("/auth/{}", openid_client.provider);

                let openid_route = Router::new()
                    .route("/login", get(oidc_page_login::openid_connect_login))
                    .route("/link", get(oidc_page_login::openid_connect_link))
                    .route("/auth", get(oidc_page_auth::openid_connect_auth))
                    .layer(Extension(Arc::new(openid_client)));

                router = router.nest(&path, openid_route);
            }

            for oauth2_client in self.oauth2_clients {
                let path = format!("/auth/{}", oauth2_client.provider);

                let openid_route = Router::new()
                    .route("/login", get(oauth2_page_login::oauth2_connect_login))
                    .route("/link", get(oauth2_page_login::oauth2_connect_link))
                    .route("/auth", get(oauth2_page_auth::oauth2_connect_auth))
                    .layer(Extension(Arc::new(oauth2_client)));

                router = router.nest(&path, openid_route);
            }

            router
                .layer(self.auth_session_meta.into_layer())
                .with_state(self.state.clone())
        };

        let api_router = Router::new()
            .route("/auth/userinfo", get(ep_user_info::user_info))
            .route("/auth/providers", get(ep_get_providers::get_providers))
            .with_state(self.state);

        (page_router, api_router)
    }
}

pub(in crate::auth) fn create_redirect_page(
    state: &AuthServiceState,
    title: &str,
    target: &str,
    target_url: Option<&str>,
) -> Html<String> {
    let mut context = tera::Context::new();
    context.insert("title", title);
    context.insert("target", target);
    context.insert("redirect_url", target_url.unwrap_or(state.home_url().as_str()));
    let html = state
        .tera()
        .render("redirect.html", &context)
        .expect("Failed to generate redirect.html template");
    Html(html)
}

pub(in crate::auth) fn create_ooops_page(state: &AuthServiceState, detail: Option<&str>) -> Html<String> {
    let mut context = tera::Context::new();
    context.insert("home_url", state.home_url());
    context.insert("detail", &detail.unwrap_or_default());
    let html = state
        .tera()
        .render("ooops.html", &context)
        .expect("Failed to generate ooops.html template");
    Html(html)
}

#[cfg(test)]
mod test {
    use axum_extra::extract::cookie::Key;
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    use shine_test::test;

    #[test]
    #[ignore = "This is not a test but a helper to generate secret"]
    fn generate_secret() {
        let key = Key::generate();
        println!("{}", B64.encode(key.master()));
    }
}
