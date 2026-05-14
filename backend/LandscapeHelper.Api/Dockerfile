# syntax=docker/dockerfile:1.7

FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

COPY backend/LandscapeHelper.Api/LandscapeHelper.Api.csproj backend/LandscapeHelper.Api/
RUN dotnet restore backend/LandscapeHelper.Api/LandscapeHelper.Api.csproj

COPY backend/ backend/
WORKDIR /src/backend/LandscapeHelper.Api
RUN dotnet publish -c Release -o /app/publish --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app
# wget for healthcheck; icu-libs for globalization.
# aspnet:10.0-alpine ships with a pre-created non-root `app` user.
RUN apk add --no-cache wget icu-libs
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false
COPY --from=build --chown=app:app /app/publish .
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "LandscapeHelper.Api.dll"]
