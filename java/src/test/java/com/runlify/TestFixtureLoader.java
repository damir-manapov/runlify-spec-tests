package com.runlify;

import com.runlify.metadata.ProjectMetadata;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.io.File;

/**
 * Shared test utility for loading metadata.json fixtures.
 */
public final class TestFixtureLoader {

    private static final JsonMapper MAPPER = JsonMapper.builder()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .build();
    private static final String FIXTURES_BASE = "../tests/fixtures";

    private TestFixtureLoader() {}

    public static ProjectMetadata load(String fixture) {
        var file = new File(FIXTURES_BASE + "/" + fixture + "/metadata.json");
        if (!file.exists()) {
            throw new IllegalStateException("Fixture not found: " + file.getAbsolutePath());
        }
        return MAPPER.readValue(file, ProjectMetadata.class);
    }
}
