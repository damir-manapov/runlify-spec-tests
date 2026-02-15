package com.runlify.schema;

import com.runlify.metadata.MetadataLoader;
import com.runlify.metadata.ProjectMetadata;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.net.URI;
import java.util.List;

/**
 * Runs database migrations on startup: drops and recreates all tables
 * from the metadata-driven DDL.
 *
 * Supports PostgreSQL schema isolation via ?schema= query parameter
 * on the datasource URL (for parallel test runs).
 */
@Service
public class MigrationService implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(MigrationService.class);

    private final JdbcTemplate jdbc;
    private final SchemaGenerator schemaGenerator;
    private final ProjectMetadata metadata;
    private final DataSource dataSource;

    public MigrationService(
        JdbcTemplate jdbc,
        SchemaGenerator schemaGenerator,
        MetadataLoader metadataLoader,
        DataSource dataSource
    ) {
        this.jdbc = jdbc;
        this.schemaGenerator = schemaGenerator;
        this.metadata = metadataLoader.getMetadata();
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        ensureSchema();
        migrate();
    }

    /**
     * If the JDBC URL contains a ?schema= parameter, create and set that schema.
     */
    private void ensureSchema() {
        try {
            var url = dataSource.getConnection().getMetaData().getURL();
            var schema = extractSchema(url);
            if (schema != null && !schema.isEmpty() && !"public".equals(schema)) {
                log.info("Creating and switching to schema: {}", schema);
                jdbc.execute("CREATE SCHEMA IF NOT EXISTS \"%s\"".formatted(schema));
                jdbc.execute("SET search_path TO \"%s\"".formatted(schema));
            }
        } catch (Exception e) {
            log.warn("Could not check/set schema: {}", e.getMessage());
        }
    }

    /**
     * Drop and recreate all tables from metadata.
     */
    private void migrate() {
        var statements = schemaGenerator.generateDdl(metadata);
        log.info("Running migration: {} SQL statements for {} entities",
            statements.size(), metadata.allEntities().size());

        for (var sql : statements) {
            log.debug("Executing: {}", sql);
            jdbc.execute(sql);
        }

        log.info("Migration complete");
    }

    /**
     * Extract the 'schema' query parameter from a JDBC URL.
     * Handles both jdbc:postgresql://host/db?schema=xxx and ?currentSchema=xxx
     */
    static String extractSchema(String jdbcUrl) {
        if (jdbcUrl == null) return null;
        try {
            // Strip "jdbc:" prefix for URI parsing
            var raw = jdbcUrl.startsWith("jdbc:") ? jdbcUrl.substring(5) : jdbcUrl;
            var uri = URI.create(raw);
            var query = uri.getQuery();
            if (query == null) return null;
            for (var param : query.split("&")) {
                var kv = param.split("=", 2);
                if (kv.length == 2 && ("schema".equals(kv[0]) || "currentSchema".equals(kv[0]))) {
                    return kv[1];
                }
            }
        } catch (Exception e) {
            // fallback: simple string search
            for (var prefix : List.of("schema=", "currentSchema=")) {
                var idx = jdbcUrl.indexOf(prefix);
                if (idx >= 0) {
                    var start = idx + prefix.length();
                    var end = jdbcUrl.indexOf('&', start);
                    return end < 0 ? jdbcUrl.substring(start) : jdbcUrl.substring(start, end);
                }
            }
        }
        return null;
    }
}
