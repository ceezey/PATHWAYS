# PATHWAYS

A Digital Integrated Program Monitoring and Dashboard System with a Metadata-Driven Mechanism.

## Overview

PATHWAYS is a web-based monitoring platform designed to improve how organizations manage, organize, visualize, and report program monitoring data. The system is built around a metadata-driven workflow so that monitoring datasets collected from field tools such as KOBO can be imported, interpreted, organized, and prepared for dashboarding and reporting more consistently.

The platform is intended to support program-level monitoring by centralizing participant records, imported datasets, dashboard parameters, demographic breakdowns, and report-ready outputs inside one structured system.

## Purpose

The purpose of PATHWAYS is to reduce fragmented post-collection workflows by providing a centralized system for:

- organizing participant records
- managing imported monitoring datasets
- supporting metadata-driven bulk upload
- visualizing project indicators and performance metrics
- supporting Sex, Age, and Disability Disaggregated Data (SADDD) analysis
- generating automated monitoring reports
- preparing data in formats aligned with higher-level reporting requirements

The system is being developed as a web-based platform with separate frontend, backend, and shared packages to support maintainability and long-term extensibility.

## Primary Development Goals

This repository is being prepared to support development of the following core capabilities:

- centralized participant and monitoring database
- metadata-compatible import and export workflow
- participant profile management
- dashboard visualization
- reporting and data export
- role-based access control
- file storage for uploads and reports
- development-ready testing, formatting, and CI workflows

## High-Level Architecture

This repository uses a monorepo structure.

```text
apps/
  web/        -> Next.js frontend
  api/        -> NestJS backend

packages/
  shared/     -> shared types, schemas, constants
  ui/         -> optional shared UI building blocks
  config/     -> optional shared config
  imports/    -> import/export parsing and helpers